const express = require("express")
const { body, validationResult } = require('express-validator');
const router = express.Router()
const { getLoggedInUser } = require('../helpers/getLoggedInUser.js');
const request = require('request')
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin} = require('../helpers/redirectLogin')

// formats a javascript date to 'YYYY-MM-DD'
// used to make sure that when we are comparing dates from the API data
// and the database we are using the same format
function formatDate(date) {
    if (!date) {
        return ''; // Handle null or undefined by a blank string
    }
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // if already in 'YYYY-MM-DD' format, return it directly
        return date;
    }
    if (date instanceof Date && !isNaN(date)) {                             // if it's a valid date object, format it
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// setPricesFromAPIData called from /update route
//      gets the data for the current fund from the alphavantage API
//      it checks each date to see if it's later that the data we have 
//          if it's later then it adds a query and params to the sqlInsert object
//      it then executes them by calling setAPIPriceData and waits for the result (which will errors and information about how many updated) 
//      it calls setLastFundUpdate
function setPricesFromAPIData(fund_id, ticker, lastPriceUpdate) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.API_KEY_ALPHAVANTAGE 
        //const url = `http://localhost:8000/prices/test-external-api/?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`       
        request(url, (err, response, body) => {                                             // get the data from the API
            // use err to keep a track of all the errors using new Error to add to the object
            if (err) {
                return reject(new Error('Error fetching data from API: ' + err))
            }
            const prices = JSON.parse(body)
            if (prices["Time Series (Daily)"] === undefined) {
                return reject(new Error('Invalid API response: No Time Series data. API limit has been reached. If this has happened the price data is already the latest price data'))
            }
            const timeSeries = prices["Time Series (Daily)"]
            const sqlInserts = []
            let dataSaved = false
            // for every record in the API data that we want to insert create an insert query and params pair and store in sqlInserts
            // we don't want to insert records we already have so only do this if the date in the API data is > the last_update 
            for (const [price_date, values] of Object.entries(timeSeries)) {              
                const APIFormattedDate = formatDate(price_date)                             // Make sure dates we are comparing are all YYYY-MM-DD
                // console.log(`fund: ${fund_id} lastPriceUpdate: ${lastPriceUpdate} API formatted date: ${APIFormattedDate}`)
                if (APIFormattedDate > lastPriceUpdate) {                                   // only include data more recent than the last update
                    dataSaved = true;                                                       // remember that we have new data so we can change last_updated later on
                    const open = values["1. open"]
                    const high = values["2. high"]
                    const low = values["3. low"]
                    const close = values["4. close"]
                    const volume = values["5. volume"]
                    const sql = `
                        INSERT INTO prices (fund_id, ticker, price_date, open, high, low, close, volume)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `
                    sqlInserts.push({                                                           // store this pair of query and params in sqlInserts
                        query: sql,
                        params: [fund_id, ticker, APIFormattedDate, open, high, low, close, volume],
                    })
                }
            }
            // if there are any insert statements in sqlInserts call function to execute them all
            if (sqlInserts.length > 0) {
                setAPIPriceData(sqlInserts)
                    .then(() => {                                                              // if inserts were successful update the last_update in funds
                        // if (dataSaved) {                                                    // do this every time
                            return setFundLastUpdate(fund_id)                                   
                        //}
                        //return null;
                    })
                    .then(() => resolve(sqlInserts))                                          // resolve the promise
                    .catch((error) => reject(new Error('Database update failed: ' + error)))
            } else {
                resolve([])                                                                   // resolve the promise
            }
        });
    });
}

// setAPIPriceData called from set setPricesFromAPIData
//   this executes all of sql statements in the object passed
//   the object contains the query and the parameters to be
//   replaced 
function setAPIPriceData(sqlInserts) {
    return Promise.all(
        sqlInserts.map(({ query, params }) => {                                 
            return new Promise((resolve, reject) => {
                db.query(query, params, (err, results) => {
                    if (err) {
                        console.error('Error executing query:', err.message)
                        reject(err)
                    } else {
                        resolve(results)
                    }
                })
            })
        })
    )
};

// setFundLastUpdate called from setPricesFromAPIData
//  this sets the last_update and last_price in funds to the most recent price data
//  in the prices table for the passed fund_id
function setFundLastUpdate(fund_id) {
    return new Promise((resolve, reject) => {
        const currentDate = formatDate(new Date())
        // updates the last_update and the last_price fields - last price could be calculated from prices 
        // every time it is needed but the sql would be very complicated and it is needed in multiple places
        // so it's simpler, and more efficient to update it here. It will only change when new data is 
        // retrieved from the external API
        const sql = `
            UPDATE funds 
            SET last_update = (SELECT price_date FROM prices WHERE prices.fund_id = funds.id 
                ORDER BY price_date DESC LIMIT 1), 
                last_price = (SELECT close FROM prices WHERE prices.fund_id = funds.id 
                ORDER BY price_date DESC LIMIT 1) 
            WHERE id = ?`
        db.query(sql, [fund_id], (err, results) => {
            if (err) {
                console.error('Error executing query:', err.message);
                reject(err);
            } else {
                resolve(results);
            }
        });
        // console.log('Updating last_update field:', sql, fund_id)
        resolve()
    });
}

// update
//   this route inserts new records into the prices table for any fund
//   that has the latest price data less than today
//   it first gets a list of matching funds if there are none then there is no need to call the api
//   for each row it creates a promise containing a call to setPricesFromDataAPI
//   it then executes all of those and waits for the result (which will be information about what happened)
router.get('/update', redirectLogin, function (req, res, next) {
    const startTime = Date.now()
    const loggedInStatus = getLoggedInUser(req)

    let sqlquery = '';
    // this sql gets the last date the prices were updated for every fund
    // that was updated earlier than today
    // left join on prices is required because if it was just a join only
    // the funds with some prices would show, with the left join
    // all funds show - even if they have no prices, for these rows
    // the lastPriceData is null
    sqlquery = `
            SELECT funds.id AS fund_id, name, funds.ticker, MAX(prices.price_date) AS lastPriceData 
            FROM funds 
            LEFT JOIN prices ON prices.fund_id = funds.id
            WHERE (funds.last_update < curdate() OR funds.last_update is null)
            GROUP by funds.id, name, ticker`
    db.query(sqlquery,(err, result) => {
        if (err) {
            next(err)
        }
        // if there are no results then there are no funds with a null update date or a date less than the current date
        // and there is no need to call the API
        if (result.length === 0) {
            console.log('No funds require updating.');
            return res.render('pricesUpdate.ejs', 
                {updateResults:[
                    {fund_id : '', 
                    ticker : '',
                    error : 'All prices have been updated today, no API calls were made', 
                    sqlInsert : []}], 
                loggedInStatus });
        }
        // if there are results (funds that need updating)
        // go through every row in the result and 
        // create the requests using setPricesFromAPIData
        const updatePromises = result.map((row) => {
            const {fund_id, ticker, lastPriceData} = row                                    // get the values from the current row in result                                    
            const lastPriceUpdate = formatDate(lastPriceData) ?? ''                      // default to an empty string if null, convert to YYYY-MM-DD

            return setPricesFromAPIData(fund_id, ticker, lastPriceUpdate)
            .then((sqlInserts) => ({fund_id, ticker, sqlInserts}))                          
            .catch((error) => {
                console.error(`Error updating prices for Fund ID: ${fund_id}, Ticker: ${ticker}`, error.message)
                return {fund_id, ticker, error: error.message}
            })
        })

        // execute the requests prepared above and wait for them all to finish
        Promise.all(updatePromises)
        .then((updateResults) => {                                                  // use the results to log any errors
            const endTime = Date.now()                                              // to check how long it took
            // log the total time and results
            console.log('Timing: Total time taken:', endTime - startTime, 'ms.')
            updateResults.forEach((result) => {
                if (result.error) {
                    console.log(`Failed to update Fund ID: ${result.fund_id}, Ticker: ${result.ticker}, Error: ${result.error}`)
                } else {
                    console.log(`Updated Fund ID: ${result.fund_id}, Ticker: ${result.ticker}, Records Inserted: ${result.sqlInserts.length}`)
                }
            })
            // Render the results
            res.render('pricesUpdate.ejs', {updateResults, loggedInStatus })
        })
        .catch((error) => {
            console.error('Error during fund updates:', error.message)
            res.status(500).send('Error during fund updates.')
        })
    })
});

// this is a test route which provides the same format of data as alphvantage
// because the alphavantage api is rate limited this allows testing
// without using up real access counts to the api
router.get('/test-external-api',function(req, res, next){
    res.send(`{
    "Meta Data": {
        "1. Information": "Daily Prices (open, high, low, close) and Volumes",
        "2. Symbol": "VMIG.LON",
        "3. Last Refreshed": "2024-11-27",
        "4. Output Size": "Compact",
        "5. Time Zone": "US/Eastern"
    },
    "Time Series (Daily)": {
        "2024-11-28": {
            "1. open": "36.8000",
            "2. high": "36.8600",
            "3. low": "36.6922",
            "4. close": "36.7725",
            "5. volume": "17315"
        },
        "2024-11-27": {
            "1. open": "36.8000",
            "2. high": "36.8600",
            "3. low": "36.6922",
            "4. close": "36.7725",
            "5. volume": "17315"
        },
        "2024-11-26": {
            "1. open": "36.7950",
            "2. high": "37.0950",
            "3. low": "36.7200",
            "4. close": "36.7725",
            "5. volume": "17418"
        },
        "2024-11-25": {
            "1. open": "37.0050",
            "2. high": "37.0775",
            "3. low": "36.7500",
            "4. close": "37.0775",
            "5. volume": "43795"
        },
        "2024-11-22": {
            "1. open": "36.3900",
            "2. high": "36.8050",
            "3. low": "36.2750",
            "4. close": "36.7650",
            "5. volume": "50118"
        },
        "2024-11-21": {
            "1. open": "36.3600",
            "2. high": "36.3600",
            "3. low": "35.9750",
            "4. close": "36.3000",
            "5. volume": "115801"
        },
        "2024-11-20": {
            "1. open": "36.5150",
            "2. high": "36.5900",
            "3. low": "36.0750",
            "4. close": "36.0850",
            "5. volume": "27546"
        },
        "2024-11-19": {
            "1. open": "36.2500",
            "2. high": "36.5300",
            "3. low": "36.1350",
            "4. close": "36.4150",
            "5. volume": "67202"
        },
        "2024-11-18": {
            "1. open": "36.5200",
            "2. high": "36.7200",
            "3. low": "36.2400",
            "4. close": "36.3600",
            "5. volume": "9554"
        },
        "2024-11-15": {
            "1. open": "36.5900",
            "2. high": "36.6800",
            "3. low": "36.3700",
            "4. close": "36.5150",
            "5. volume": "25934"
        },
        "2024-11-14": {
            "1. open": "36.4650",
            "2. high": "36.5775",
            "3. low": "36.2800",
            "4. close": "36.5775",
            "5. volume": "76918"
        },
        "2024-11-13": {
            "1. open": "36.6000",
            "2. high": "36.6050",
            "3. low": "36.1800",
            "4. close": "36.2775",
            "5. volume": "17463"
        },
        "2024-11-12": {
            "1. open": "36.6950",
            "2. high": "36.8350",
            "3. low": "36.4150",
            "4. close": "36.4325",
            "5. volume": "29484"
        },
        "2024-11-11": {
            "1. open": "36.6950",
            "2. high": "37.0750",
            "3. low": "36.6100",
            "4. close": "36.9250",
            "5. volume": "36789"
        },
        "2024-11-08": {
            "1. open": "36.8300",
            "2. high": "36.8300",
            "3. low": "36.4850",
            "4. close": "36.5650",
            "5. volume": "35219"
        },
        "2024-11-07": {
            "1. open": "36.6150",
            "2. high": "36.7800",
            "3. low": "36.4700",
            "4. close": "36.7800",
            "5. volume": "22912"
        },
        "2024-11-06": {
            "1. open": "36.7800",
            "2. high": "37.0750",
            "3. low": "36.3450",
            "4. close": "36.4250",
            "5. volume": "54759"
        },
        "2024-11-05": {
            "1. open": "36.3400",
            "2. high": "36.6200",
            "3. low": "36.3150",
            "4. close": "36.3150",
            "5. volume": "23960"
        },
        "2024-11-04": {
            "1. open": "36.5900",
            "2. high": "36.6750",
            "3. low": "36.4400",
            "4. close": "36.4600",
            "5. volume": "32421"
        },
        "2024-11-01": {
            "1. open": "36.3250",
            "2. high": "36.5800",
            "3. low": "36.3050",
            "4. close": "36.5200",
            "5. volume": "64089"
        },
        "2024-10-31": {
            "1. open": "36.9300",
            "2. high": "36.9300",
            "3. low": "36.2500",
            "4. close": "36.3550",
            "5. volume": "47283"
        },
        "2024-10-30": {
            "1. open": "36.7850",
            "2. high": "37.4600",
            "3. low": "36.6500",
            "4. close": "36.9250",
            "5. volume": "55580"
        },
        "2024-10-29": {
            "1. open": "37.2500",
            "2. high": "37.3100",
            "3. low": "36.7250",
            "4. close": "36.8000",
            "5. volume": "35968"
        },
        "2024-10-28": {
            "1. open": "37.1400",
            "2. high": "37.3500",
            "3. low": "37.0628",
            "4. close": "37.1850",
            "5. volume": "90564"
        },
        "2024-10-25": {
            "1. open": "37.0200",
            "2. high": "37.2300",
            "3. low": "36.9700",
            "4. close": "37.1975",
            "5. volume": "1169619"
        },
        "2024-10-24": {
            "1. open": "37.1700",
            "2. high": "37.3950",
            "3. low": "36.9750",
            "4. close": "37.0400",
            "5. volume": "12084"
        },
        "2024-10-23": {
            "1. open": "37.4000",
            "2. high": "37.4200",
            "3. low": "37.0973",
            "4. close": "37.1025",
            "5. volume": "39411"
        },
        "2024-10-22": {
            "1. open": "37.1950",
            "2. high": "37.3950",
            "3. low": "37.0750",
            "4. close": "37.3550",
            "5. volume": "10467"
        },
        "2024-10-21": {
            "1. open": "37.7350",
            "2. high": "37.7350",
            "3. low": "37.2450",
            "4. close": "37.4000",
            "5. volume": "131377"
        },
        "2024-10-18": {
            "1. open": "37.4850",
            "2. high": "37.7000",
            "3. low": "37.4200",
            "4. close": "37.6600",
            "5. volume": "31801"
        },
        "2024-10-17": {
            "1. open": "37.6350",
            "2. high": "37.6885",
            "3. low": "37.2950",
            "4. close": "37.5800",
            "5. volume": "25021"
        },
        "2024-10-16": {
            "1. open": "37.1650",
            "2. high": "37.4980",
            "3. low": "37.0350",
            "4. close": "37.3650",
            "5. volume": "59925"
        },
        "2024-10-15": {
            "1. open": "37.0550",
            "2. high": "37.2250",
            "3. low": "37.0100",
            "4. close": "37.0975",
            "5. volume": "34510"
        },
        "2024-10-14": {
            "1. open": "37.2200",
            "2. high": "37.2200",
            "3. low": "36.8911",
            "4. close": "37.0675",
            "5. volume": "24849"
        },
        "2024-10-11": {
            "1. open": "37.0200",
            "2. high": "37.0750",
            "3. low": "36.9000",
            "4. close": "37.0100",
            "5. volume": "49772"
        },
        "2024-10-10": {
            "1. open": "37.3950",
            "2. high": "37.4450",
            "3. low": "36.8900",
            "4. close": "36.9225",
            "5. volume": "32173"
        },
        "2024-10-09": {
            "1. open": "36.9750",
            "2. high": "37.2250",
            "3. low": "36.8250",
            "4. close": "37.2100",
            "5. volume": "34810"
        },
        "2024-10-08": {
            "1. open": "37.1100",
            "2. high": "37.1500",
            "3. low": "36.7418",
            "4. close": "36.8550",
            "5. volume": "23150"
        },
        "2024-10-07": {
            "1. open": "37.5100",
            "2. high": "37.5100",
            "3. low": "37.0800",
            "4. close": "37.1975",
            "5. volume": "86787"
        },
        "2024-10-04": {
            "1. open": "37.1150",
            "2. high": "37.4350",
            "3. low": "37.0000",
            "4. close": "37.3425",
            "5. volume": "22459"
        },
        "2024-10-03": {
            "1. open": "37.0500",
            "2. high": "37.2600",
            "3. low": "37.0150",
            "4. close": "37.0525",
            "5. volume": "45303"
        },
        "2024-10-02": {
            "1. open": "37.4400",
            "2. high": "37.5000",
            "3. low": "37.0350",
            "4. close": "37.1125",
            "5. volume": "18843"
        },
        "2024-10-01": {
            "1. open": "37.8400",
            "2. high": "37.8400",
            "3. low": "37.3500",
            "4. close": "37.3700",
            "5. volume": "13031"
        },
        "2024-09-30": {
            "1. open": "37.6700",
            "2. high": "37.9200",
            "3. low": "37.5000",
            "4. close": "37.5850",
            "5. volume": "39106"
        },
        "2024-09-27": {
            "1. open": "37.6650",
            "2. high": "37.8900",
            "3. low": "37.5050",
            "4. close": "37.8900",
            "5. volume": "24085"
        },
        "2024-09-26": {
            "1. open": "37.3650",
            "2. high": "37.6350",
            "3. low": "37.0750",
            "4. close": "37.4900",
            "5. volume": "23398"
        },
        "2024-09-25": {
            "1. open": "37.0950",
            "2. high": "37.2950",
            "3. low": "36.9928",
            "4. close": "37.0100",
            "5. volume": "19581"
        },
        "2024-09-24": {
            "1. open": "37.2050",
            "2. high": "37.4350",
            "3. low": "37.0670",
            "4. close": "37.0850",
            "5. volume": "23124"
        },
        "2024-09-23": {
            "1. open": "37.3950",
            "2. high": "37.3950",
            "3. low": "37.0554",
            "4. close": "37.1800",
            "5. volume": "23260"
        },
        "2024-09-20": {
            "1. open": "37.5350",
            "2. high": "37.6600",
            "3. low": "37.1550",
            "4. close": "37.1775",
            "5. volume": "21362"
        },
        "2024-09-19": {
            "1. open": "37.6000",
            "2. high": "37.7325",
            "3. low": "37.2000",
            "4. close": "37.7325",
            "5. volume": "20309"
        },
        "2024-09-18": {
            "1. open": "37.2550",
            "2. high": "37.3650",
            "3. low": "37.1225",
            "4. close": "37.1225",
            "5. volume": "8488"
        },
        "2024-09-17": {
            "1. open": "37.3900",
            "2. high": "37.5250",
            "3. low": "37.2800",
            "4. close": "37.3400",
            "5. volume": "30673"
        },
        "2024-09-16": {
            "1. open": "36.9250",
            "2. high": "37.2900",
            "3. low": "36.9250",
            "4. close": "37.2900",
            "5. volume": "34646"
        },
        "2024-09-13": {
            "1. open": "37.0500",
            "2. high": "37.3000",
            "3. low": "36.7350",
            "4. close": "37.2100",
            "5. volume": "41559"
        },
        "2024-09-12": {
            "1. open": "37.0050",
            "2. high": "37.1400",
            "3. low": "36.6300",
            "4. close": "36.8650",
            "5. volume": "32421"
        },
        "2024-09-11": {
            "1. open": "36.8000",
            "2. high": "36.8850",
            "3. low": "36.5100",
            "4. close": "36.5650",
            "5. volume": "46439"
        },
        "2024-09-10": {
            "1. open": "36.7600",
            "2. high": "36.8800",
            "3. low": "36.6250",
            "4. close": "36.7550",
            "5. volume": "21524"
        },
        "2024-09-09": {
            "1. open": "36.5550",
            "2. high": "36.7700",
            "3. low": "36.5550",
            "4. close": "36.7600",
            "5. volume": "17786"
        },
        "2024-09-06": {
            "1. open": "36.9900",
            "2. high": "37.0750",
            "3. low": "36.4801",
            "4. close": "36.4850",
            "5. volume": "30611"
        },
        "2024-09-05": {
            "1. open": "36.9700",
            "2. high": "37.2150",
            "3. low": "36.8400",
            "4. close": "36.9550",
            "5. volume": "106057"
        },
        "2024-09-04": {
            "1. open": "37.0450",
            "2. high": "37.0750",
            "3. low": "36.6750",
            "4. close": "37.0250",
            "5. volume": "21522"
        },
        "2024-09-03": {
            "1. open": "37.4950",
            "2. high": "37.5350",
            "3. low": "36.9900",
            "4. close": "37.0525",
            "5. volume": "21329"
        },
        "2024-09-02": {
            "1. open": "37.5350",
            "2. high": "37.7450",
            "3. low": "37.3250",
            "4. close": "37.3250",
            "5. volume": "43427"
        },
        "2024-08-30": {
            "1. open": "37.5550",
            "2. high": "37.7180",
            "3. low": "37.4050",
            "4. close": "37.5425",
            "5. volume": "72099"
        },
        "2024-08-29": {
            "1. open": "37.5450",
            "2. high": "37.7050",
            "3. low": "37.3750",
            "4. close": "37.4850",
            "5. volume": "18889"
        },
        "2024-08-28": {
            "1. open": "37.7750",
            "2. high": "37.7750",
            "3. low": "37.4400",
            "4. close": "37.4400",
            "5. volume": "26909"
        },
        "2024-08-27": {
            "1. open": "37.5750",
            "2. high": "37.9100",
            "3. low": "37.5750",
            "4. close": "37.6450",
            "5. volume": "53822"
        },
        "2024-08-23": {
            "1. open": "37.5200",
            "2. high": "37.7700",
            "3. low": "37.4900",
            "4. close": "37.6950",
            "5. volume": "18729"
        },
        "2024-08-22": {
            "1. open": "37.6200",
            "2. high": "37.8450",
            "3. low": "37.4450",
            "4. close": "37.4450",
            "5. volume": "60444"
        },
        "2024-08-21": {
            "1. open": "37.3300",
            "2. high": "37.5650",
            "3. low": "37.2500",
            "4. close": "37.5650",
            "5. volume": "97717"
        },
        "2024-08-20": {
            "1. open": "37.6200",
            "2. high": "37.7400",
            "3. low": "37.2650",
            "4. close": "37.2650",
            "5. volume": "28611"
        },
        "2024-08-19": {
            "1. open": "37.3750",
            "2. high": "37.6050",
            "3. low": "37.2750",
            "4. close": "37.5050",
            "5. volume": "16711"
        },
        "2024-08-16": {
            "1. open": "37.5350",
            "2. high": "37.5500",
            "3. low": "37.3150",
            "4. close": "37.3800",
            "5. volume": "32560"
        },
        "2024-08-15": {
            "1. open": "37.1400",
            "2. high": "37.5500",
            "3. low": "37.0200",
            "4. close": "37.4225",
            "5. volume": "64551"
        },
        "2024-08-14": {
            "1. open": "36.9550",
            "2. high": "37.1750",
            "3. low": "36.7850",
            "4. close": "37.1400",
            "5. volume": "18846"
        },
        "2024-08-13": {
            "1. open": "36.7700",
            "2. high": "36.8250",
            "3. low": "36.5500",
            "4. close": "36.7700",
            "5. volume": "12721"
        },
        "2024-08-12": {
            "1. open": "36.8450",
            "2. high": "36.8450",
            "3. low": "36.5350",
            "4. close": "36.6550",
            "5. volume": "14059"
        },
        "2024-08-09": {
            "1. open": "36.3400",
            "2. high": "36.7550",
            "3. low": "36.2700",
            "4. close": "36.5250",
            "5. volume": "36247"
        },
        "2024-08-08": {
            "1. open": "36.2150",
            "2. high": "36.3697",
            "3. low": "35.8850",
            "4. close": "36.3450",
            "5. volume": "40358"
        },
        "2024-08-07": {
            "1. open": "36.4850",
            "2. high": "36.5150",
            "3. low": "36.2200",
            "4. close": "36.5100",
            "5. volume": "126358"
        },
        "2024-08-06": {
            "1. open": "36.2800",
            "2. high": "36.4650",
            "3. low": "35.8500",
            "4. close": "36.1450",
            "5. volume": "83047"
        },
        "2024-08-05": {
            "1. open": "36.4350",
            "2. high": "36.5900",
            "3. low": "34.6200",
            "4. close": "35.8750",
            "5. volume": "122616"
        },
        "2024-08-02": {
            "1. open": "37.6450",
            "2. high": "37.9450",
            "3. low": "36.9250",
            "4. close": "36.9600",
            "5. volume": "52587"
        },
        "2024-08-01": {
            "1. open": "38.3600",
            "2. high": "38.6310",
            "3. low": "37.9343",
            "4. close": "38.0100",
            "5. volume": "36924"
        },
        "2024-07-31": {
            "1. open": "38.2600",
            "2. high": "38.4450",
            "3. low": "38.1350",
            "4. close": "38.3600",
            "5. volume": "29432"
        },
        "2024-07-30": {
            "1. open": "37.6400",
            "2. high": "38.2100",
            "3. low": "37.4650",
            "4. close": "38.0950",
            "5. volume": "84952"
        },
        "2024-07-29": {
            "1. open": "37.9000",
            "2. high": "38.1800",
            "3. low": "37.6940",
            "4. close": "37.7050",
            "5. volume": "30475"
        },
        "2024-07-26": {
            "1. open": "37.0900",
            "2. high": "37.8950",
            "3. low": "37.0300",
            "4. close": "37.8850",
            "5. volume": "34439"
        },
        "2024-07-25": {
            "1. open": "37.1900",
            "2. high": "37.2600",
            "3. low": "36.7340",
            "4. close": "37.0750",
            "5. volume": "64286"
        },
        "2024-07-24": {
            "1. open": "37.3000",
            "2. high": "37.4250",
            "3. low": "37.1600",
            "4. close": "37.1600",
            "5. volume": "69737"
        },
        "2024-07-23": {
            "1. open": "37.5100",
            "2. high": "37.6150",
            "3. low": "37.3150",
            "4. close": "37.4250",
            "5. volume": "18154"
        },
        "2024-07-22": {
            "1. open": "37.4750",
            "2. high": "37.6600",
            "3. low": "37.3800",
            "4. close": "37.4800",
            "5. volume": "31769"
        },
        "2024-07-19": {
            "1. open": "37.6500",
            "2. high": "37.6500",
            "3. low": "37.2900",
            "4. close": "37.3250",
            "5. volume": "60654"
        },
        "2024-07-18": {
            "1. open": "37.7300",
            "2. high": "37.8750",
            "3. low": "37.4350",
            "4. close": "37.6425",
            "5. volume": "140484"
        },
        "2024-07-17": {
            "1. open": "37.8150",
            "2. high": "37.8150",
            "3. low": "37.3600",
            "4. close": "37.3650",
            "5. volume": "47051"
        },
        "2024-07-16": {
            "1. open": "37.4050",
            "2. high": "37.6350",
            "3. low": "37.4050",
            "4. close": "37.6300",
            "5. volume": "36241"
        },
        "2024-07-15": {
            "1. open": "37.5450",
            "2. high": "37.6750",
            "3. low": "37.3650",
            "4. close": "37.5600",
            "5. volume": "27250"
        },
        "2024-07-12": {
            "1. open": "37.7300",
            "2. high": "37.7300",
            "3. low": "37.4500",
            "4. close": "37.6150",
            "5. volume": "35471"
        },
        "2024-07-11": {
            "1. open": "37.1250",
            "2. high": "37.5900",
            "3. low": "37.0600",
            "4. close": "37.5900",
            "5. volume": "82083"
        },
        "2024-07-10": {
            "1. open": "36.6150",
            "2. high": "37.1050",
            "3. low": "36.5600",
            "4. close": "37.1050",
            "5. volume": "28356"
        }
    }
}`)
})

// Export the router object so index.js can access it
module.exports = router
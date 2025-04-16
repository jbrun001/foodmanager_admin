// funds.js
// this route manages pages relating to funds
const express = require("express")
const router = express.Router()
const { validateAndSanitiseFunds } = require('../helpers/validateAndSanitiseInput');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin} = require('../helpers/redirectLogin')

// getFundsSearchResults
// gets searches funds based on the parameters passed and orders the result by the sort_by parameter
// this uses a promise, the calling code will wait for this to return a result before it continues
// this is necessary when we need to get results from multiple data queries (rather than nesting them)
// and this code could be re-used by other routes 
function getFundSearch(search_text, sort_by) {
//console.log('getFundSearchResult: search_text: >' + search_text + '< sort_by: >' + sort_by +'<')
    return new Promise((resolve, reject) => {
        // manage default parameters (like if being called from the menu)
        if (typeof search_text === "undefined") search_text = ''
        if (typeof sort_by === 'undefined') sort_by = 'fee'
        let sqlquery = "";
        search_text = '%' + search_text + '%'
        let order = ' ' + sort_by + ' DESC'                 // default is descending order
        if (sort_by === "fee") order = ' fee ASC'           // except fees which are in ascending order
        sqlquery = "SELECT * FROM funds WHERE "
        sqlquery = sqlquery + "name LIKE '" + search_text + "' ORDER BY " + order
        db.query(sqlquery, (err, results) => {
            if (err) {
                console.error(err.message);
                reject(err); // if there is an error reject the Promise
            } else {
                resolve(results); // the Promise is resolved with the result of the query
            }
        });
    });
}

// getUserPortfolios
// gets all the fields for the portfolios for the userId that is passed
// this is used to get the select box options in funds/search-result 
// this uses a promise, the calling code will wait for this to return a result before it continues
function getUserPortfolios(userId) {
// console.log('getUserPortfolios: userId: >' + userId + '<')
    return new Promise((resolve, reject) => {
        let sqlquery = "";
        sqlquery = "SELECT * FROM portfolios WHERE user_id = ?"
// console.log('getUserPortfolios: sqlquery: >' + sqlquery + '<')
        // execute sql query
        db.query(sqlquery,userId, (err, results) => {
            if (err) {
                console.error(err.message);
                reject(err); // if there is an error reject the Promise
            } else {
                resolve(results); // the Promise is resolved with the result of the query
            }
        });
    });
}

router.get('/search-result',validateAndSanitiseFunds,redirectLogin, function (req, res, next) {
    // Search the list of available funds
    let loggedInStatus = getLoggedInUser(req)
    let search_text = req.query.search_text
    let sort_by = req.query.sort_by
//    console.log({ test: "search-result-promise", previousData: req.query, messages: req.validationErrors });
    if (req.validationErrors) {
        // debug to test data is there
//        console.log({ success: false, previousData: req.query, messages: req.validationErrors });
        // if there are errors then send the old data and the messages to the form
        // so they can be displayed
        return res.render('fundsSearchResults.ejs', {
            loggedInStatus,
            previousData: req.query,
            messages: req.validationErrors,
            funds: [],   // if there are errors don't display any funds
            crsfToken: req.csrfToken()
        });
    }
    else {
        Promise.all([
            getFundSearch(search_text, sort_by),                                 // Promise.all[0]
            getUserPortfolios(req.session.userId)                                // Promise.all[1]
        ])
        .then(([getFundSearchResults,getUserPortfolioResults]) => {              // for more query results name them here 1st field is promise.all[0] etc.
            res.render("fundsSearchResults.ejs", {
                loggedInStatus,
                funds: getFundSearchResults,
                portfolios: getUserPortfolioResults,
                previousData: req.query,
                messages: [],  // if code here then it's successful and messages is empty
                crsfToken: req.csrfToken()
            });
        })
        .catch((error) => {
            console.log("getFundSearch, getUserPortfolio. Error getting data from database calls or in the code above");
        });
    }
})

router.post('/list',validateAndSanitiseFunds, redirectLogin, function(req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    // group transactions to get list of funds in this portfolio
    let sqlquery = `SELECT transactions.fund_id as fund_id, funds.ticker, funds.name, FORMAT(funds.last_price,2),
                    	FORMAT(SUM(transactions.volume * transactions.share_price),2) AS total_cost, 
                        FORMAT(SUM(transactions.volume),2) AS total_shares,
                        MAX(transactions.transaction_date) AS last_transaction,
                        FORMAT(SUM(transactions.volume * funds.last_price),2) AS current_value
                    FROM transactions JOIN funds ON transactions.fund_id = funds.id 
                    WHERE transactions.user_id = ? AND transactions.portfolio_id = ?
                    GROUP BY transactions.fund_id, funds.name 
                    ORDER BY funds.name`
    // execute sql query
    db.query(sqlquery,[req.session.userId, req.body.portfolio_id], (err, result) => {
        if (err) {
            next(err)
        }
        res.render("fundsList.ejs", {
            loggedInStatus, 
            portfolio_id:req.body.portfolio_id, 
            portfolio_name:req.body.portfolio_name, 
            funds:result,
            crsfToken: req.csrfToken()
         })
     })
})

router.get('/add',validateAndSanitiseFunds, redirectLogin, function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    if (req.session.userType == 'admin') {
        res.render("fundsAdd.ejs",{
            loggedInStatus, 
            crsfToken: req.csrfToken()})
    } else res.redirect(ORIGIN_URL+"/")
})

// Export the router object so index.js can access it
module.exports = router
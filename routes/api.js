const express = require("express")
const { param, validationResult } = require('express-validator');
const router = express.Router()
const { ORIGIN_URL } = require('../helpers/getOriginURL')

// Security. Import express-rate-limit so we can stop 
// over use of the API which could cause and denial of service
const rateLimit = require('express-rate-limit');
const apiRateLimiter = rateLimit({
    windowMs: 3 * 60 * 1000,             // 3 minutes before retry
    max: 20,                             // limit each IP to 20 api requests per minute
    message: '{error: "Rate Limited", message: "Thank you for using the Fund Tracker API! Our standard API rate limit is 20 requests per minute. Please wait 3 minutes before trying again."}'
});

const validateFundsSearch = [
    // Validate the `search_text` path parameter
    param('search_text')
        .notEmpty().withMessage('The search text cannot be empty. Add /text to the end of the URL where "text" is your search term.')
        .isLength({ min: 3 }).withMessage('Search text must be at least 3 characters long.')
        .isAlphanumeric('en-US', { ignore: ' ' }).withMessage('Search text must only contain alphanumeric characters.')
        .trim(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array().map(error => ({
                    field: error.param,
                    message: error.msg
                }))
            });
        }
        next();
    }
];

const validatePrice = [
    param('ticker')
        .notEmpty().withMessage('the ticker cannot be empty you need to add /VMIG.LON on the end of the url where VMIG.LON is the ticker')
        .isLength({ min: 3 }).withMessage('ticker must be greater than 3 characters')
        .isAlphanumeric('en-US', { ignore: '.' }).withMessage('ticker must be alphanumeric but can include .')
        .trim(),
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];

const validateFund = [
    param('id')
        .notEmpty().withMessage('the ticker cannot be empty you need to add /VMIG.LON on the end of the url where VMIG.LON is the ticker')
        .isInt().withMessage('the fund id must be an integer'),
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];

// provide instructions for the API
router.get('/', apiRateLimiter, function (req, res, next) {
    let apiPath = ORIGIN_URL+"/api"
    let instructions = [
        {
            endpoint: `${apiPath}/funds-search/:search_text`,
            method: "GET",
            description: "Search for funds by name. The search text must be at least 3 characters long and alphanumeric.",
            parameters: [
                {
                    name: "search_text",
                    type: "path",
                    required: true,
                    description: "The text to search for. Example: 'Distributing'."
                }
            ],
            example: {
                request: `${apiPath}/funds-search/Distributing`,
                response: [
                    {
                        "id": 56,
                        "name": "Vanguard FTSE North America UCITS ETF Distributing",
                        "ticker": "VDNR.LON"
                    },
                    {
                        "id": 52,
                        "name": "Vanguard FTSE Developed Europe ex UK UCITS ETF Distributing",
                        "ticker": "VERX.LON"
                    }
                ]
            }
        },
        {
            endpoint: `${apiPath}/fund/:id`,
            method: "GET",
            description: "Retrieve the full details for the fund with the given fund id.",
            parameters: [
                {
                    name: "id",
                    type: "path",
                    required: true,
                    description: "The fund id of the fund. Example: '50'."
                }
            ],
            example: {
                request: `${apiPath}/fund/50`,
                response: {
                    "id": 50,
                    "holder": "",
                    "name": "Vanguard FTSE 250 UCITS ETF Distributing",
                    "size": "2035000000.00",
                    "fee": "0.00100",
                    "distribution": "Distributing",
                    "holdings": "252.00",
                    "dividend_yield": "0.03670",
                    "isin": "IE00BKX55Q28",
                    "ticker": "VMID.LON",
                    "last_update": "2024-12-13T00:00:00.000Z",
                    "last_price": "31.96000"
                }
            }
        },
        {
            endpoint: `${apiPath}/price/:ticker`,
            method: "GET",
            description: "Retrieve the latest price for a given ticker symbol.",
            parameters: [
                {
                    name: "ticker",
                    type: "path",
                    required: true,
                    description: "The ticker symbol of the fund. Example: 'VMIG.LON'."
                }
            ],
            example: {
                request: `${apiPath}/price/VMIG.LON`,
                response: {
                    date: "2024-12-13T00:00:00.000Z",
                    price: 73.1
                }
            }
        }
    ];
    res.status(200).json(instructions);
});

// gets a list of all funds from the database
// no authentication checks as is public API
// no validation and sanitisation as no parameters
router.get('/funds', apiRateLimiter, function (req, res, next) {
    // query database to get all the funds
    let sqlquery = "SELECT id, name, ticker FROM funds"
    // execute the sql query
    db.query(sqlquery, (err, result) => {
        // return results as a JSON object
        if (err) {            
            console.error("Database error:", err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An error occurred while querying the database."
            });            
            next(err)
        }
        // where no funds are found
        if (result.length === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "No funds found in the database."
            });
        } else {
            // Successful response
            res.status(200).json(result);
        }
    })
});

// gets latest price for the ticker specified
// no authentication checks as is public API
// validation and sanitisation for ticker
// takes one parameter ticker
router.get('/price/:ticker', apiRateLimiter,validatePrice, function (req, res, next) {
    // check for any validation errors
    let ticker = req.sanitize(req.params.ticker)
    if (req.validationErrors) {
        return res.status(400).json(req.validationErrors)
    }
    // query database to get all the funds
    let sqlquery = "SELECT price_date AS date, close AS price FROM prices WHERE ticker = ? ORDER BY price_date DESC LIMIT 1"
    // execute the sql query
    db.query(sqlquery, [ticker], (err, result) => {
        if (err) {            
            console.error("Database error:", err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An error occurred while querying the database."
            });            
            next(err)
        }
        // where no records are found
        if (result.length === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "That ticker could not be found in the database."
            });
        } else {
            // Successful response
            res.status(200).json(result);
        }
    })
});

router.get('/funds-search/:search_text',apiRateLimiter,validateFundsSearch, function (req, res, next) {
    // check for any validation errors
    if (req.validationErrors) {
        return res.status(400).json(req.validationErrors)
    }
    // query database to get all the funds
    let search_text = '%'+req.sanitize(req.params.search_text)+'%'
    let sqlquery = "SELECT id, name, ticker FROM funds WHERE name like ? ORDER BY ticker"
    // execute the sql query
    db.query(sqlquery, [search_text], (err, result) => {
        if (err) {            
            console.error("Database error:", err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An error occurred while querying the database."
            });            
            next(err)
        }
        // where no records are found
        if (result.length === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "No funds match the search_text in the database."
            });
        } else {
            // Successful response
            res.status(200).json(result);
        }
    })
});

// gets all details for one fund from the database
// no authentication checks as is public API
// validation for the id
router.get('/fund/:id', apiRateLimiter, validateFund,function (req, res, next) {
    if (req.validationErrors) {
        return res.status(400).json(req.validationErrors)
    }
    // query database to get all the funds
    let fund_id = req.sanitize(req.params.id)
    let sqlquery = "SELECT * FROM funds where id = ?"
    // execute the sql query
    db.query(sqlquery, [fund_id],(err, result) => {
        // return results as a JSON object
        if (err) {            
            console.error("Database error:", err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An error occurred while querying the database."
            });            
            next(err)
        }
        // where no funds are found
        if (result.length === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "No funds found in the database."
            });
        } else {
            // Successful response
            res.status(200).json(result);
        }
    })
});

// Export the router object so index.js can access it
module.exports = router
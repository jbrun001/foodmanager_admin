const express = require("express")
const router = express.Router()
const { validateAndSanitiseTransactions } = require('../helpers/validateAndSanitiseInput');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin} = require('../helpers/redirectLogin')

router.get('/list', validateAndSanitiseTransactions, redirectLogin,function(req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    let sqlquery = `SELECT funds.name as fund_name, portfolios.name as portfolio_name, transactions.id as id, 
                           volume, share_price, transaction_date
                    FROM transactions 
                    JOIN funds ON transactions.fund_id = funds.id
                    JOIN portfolios ON transactions.portfolio_id = portfolios.id 
                    WHERE transactions.user_id = ?
                    ORDER BY transactions.id DESC` 
    // execute sql query
    db.query(sqlquery, [req.session.userId],(err, result) => {
        if (err) {
            next(err)
        }
        res.render("transactionsList.ejs", {loggedInStatus, 
            availableTransactions:result,
            crsfToken: req.csrfToken()})
     })
})

router.post('/add', redirectLogin, function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    res.render('transactionsAdd.ejs', {
        loggedInStatus,
        fund_id:req.body.fund_id, 
        portfolio_id:req.body.portfolio_id,
        fund_name: req.body.fund_name,
        previousData: {}, // empty object for data previously entered
        messages: [],     // array for validation messages
        crsfToken: req.csrfToken()
    });
})

router.post('/added', validateAndSanitiseTransactions, redirectLogin, function (req, res, next) {
    // check if validation errors and if yes then re-display page with old data and error messages
console.log({ testing: "transaction/added", previousData: req.body, messages: req.validationErrors, session: req.session });
    let loggedInStatus = getLoggedInUser(req)
    if (req.validationErrors) {
        // debug to test data is there
//        console.log({ success: false, previousData: req.body, messages: req.validationErrors });
        // if there are errors then send the old data and the messages to the form
        // so they can be displayed
        return res.render('transactionsAdd.ejs', {
            loggedInStatus,
            fund_id: req.body.fund_id, 
            portfolio_id: req.body.portfolio_id,
            fund_name: req.body.fund_name,
            previousData: req.body,
            messages: req.validationErrors,
            crsfToken: req.csrfToken()
        });
    }
    else {
        // saving data in database
        let sqlquery = "INSERT INTO transactions (user_id, fund_id, portfolio_id, volume, share_price, transaction_date) VALUES (?,?,?,?,?,?)"
        // execute sql query
        let newrecord = [req.session.userId, req.body.fund_id, req.body.portfolio_id, req.body.volume, req.body.share_price, req.body.transaction_date]
        db.query(sqlquery, newrecord, (err, result) => {
            if (err) {
                next(err)
            }
            else
               // res.render("fundsList.ejs",{loggedInStatus, portfolio_id:req.body.portfolio_id})
                res.redirect(ORIGIN_URL+"/portfolios/list")
        })
    } 
}) 

router.post('/remove',validateAndSanitiseTransactions, redirectLogin,function (req, res, next) {
    // saving data in database
    let sqlquery = "delete from transactions where id = ? and user_id = ?"
    // execute sql query
    let newrecord = [req.body.transaction_id, req.session.userId]
    db.query(sqlquery, newrecord, (err, result) => {
        if (err) {
            next(err)
        }
        else res.redirect(ORIGIN_URL+"/transactions/list")
    })
}) 

// Export the router object so index.js can access it
module.exports = router
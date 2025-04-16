const express = require("express")
const router = express.Router()
const { validateAndSanitisePortfolios } = require('../helpers/validateAndSanitiseInput');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin } = require('../helpers/redirectLogin')

router.get('/list', redirectLogin,function(req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    let sqlquery = "SELECT * FROM portfolios where user_id = ?"  
    // execute sql query
    db.query(sqlquery, [req.session.userId], (err, result) => {
        if (err) {
            next(err)
        }
        res.render("portfoliosList.ejs", {loggedInStatus, 
            availablePortfolios:result,
            crsfToken: req.csrfToken()})
     })
})

router.get('/add', redirectLogin, function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    if (req.session.userType == 'admin' || req.session.userType == 'customer') {
        res.render("portfoliosAdd.ejs", {
            loggedInStatus,
            previousData: {}, // empty object for data previously entered
            messages: [],     // array for validation messages
            crsfToken: req.csrfToken()
        });
    } else{
        res.send('You do not have permissions to add a portfolio. <a href='+'/'+'>Home</a>')
    }
})

router.post('/added', validateAndSanitisePortfolios, redirectLogin,function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    // saving this portfolio for this user in the database
    if (req.validationErrors) {
        // debug to test data is there
        //console.log({ success: false, previousData: req.body, messages: req.validationErrors });
        // if there are errors then send the old data and the messages to the form
        // so they can be displayed
        return res.render('portfoliosAdd.ejs', {
            loggedInStatus,
            previousData: req.body,
            messages: req.validationErrors,
            crsfToken: req.csrfToken()
        });
    }
    else {
        let sqlquery = "INSERT INTO portfolios (name, user_id) VALUES (?,?)"
        // execute sql query
        let newrecord = [req.body.name, req.session.userId]
        db.query(sqlquery, newrecord, (err, result) => {
            if (err) {
                next(err)
            }
            else
                res.redirect(ORIGIN_URL+"/portfolios/list")  // if successful list all the portfolios 
        })
    }
}) 

router.post('/remove', redirectLogin,function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    // remove from the database
    // include user_id from session to stop editing of the html with
    // portfolios not for this user
    let sqlquery = "DELETE FROM portfolios WHERE id = ? and user_id = ?"
    // execute sql query
    let newrecord = [req.body.portfolio_id, req.session.userId]
    db.query(sqlquery, newrecord, (err, result) => {
        if (err) {
            next(err)
        }
        else {
            // res.send(' This portfolio is removed from the database, name: '+ req.body.name)
            res.redirect(ORIGIN_URL+"/portfolios/list")
        }
    })
}) 

// Export the router object so index.js can access it
module.exports = router
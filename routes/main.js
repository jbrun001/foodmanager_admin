// Create a new router
const express = require("express")
const router = express.Router()
const { getLoggedInUser } = require('../helpers/getLoggedInUser');

// Handle our routes
router.get('/',function(req, res, next){
    let loggedInStatus = getLoggedInUser(req)
    res.render('index.ejs', {loggedInStatus})
})

router.get('/about',function(req, res, next){
    let loggedInStatus = getLoggedInUser(req)
    res.render('about.ejs', {loggedInStatus})
})

// Export the router object so index.js can access it
module.exports = router
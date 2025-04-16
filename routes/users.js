// Create a new router
const express = require("express")
const router = express.Router()
const { validateAndSanitiseUsers } = require('../helpers/validateAndSanitiseInput');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin} = require('../helpers/redirectLogin')
const bcrypt = require('bcrypt')
const saltRounds = 10

// Security. Import express-rate-limit so we can stop brute forcing
// of the login
const rateLimit = require('express-rate-limit');
const loginRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,            // 1 minute before retry
    max: 5,                             // limit each IP to 5 login attempts per minute
    message: "{error:'Rate Limited', message: 'Too many login attempts, please try again after 1 minute.'}"
});

router.get('/register', function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    // the register route  is called from a url - when 
    // the user is entering data for the first time
    // register.ejs is also rendered when there was a 
    // validation error with the input fields so 
    // when we render this we need to include empty data
    // for these fields - so the .ejs still knows about
    // them
    res.render('register.ejs', {
        loggedInStatus,
        previousData: {},                               // empty object for data previously entered
        messages: [],                                   // array for validation messages
        crsfToken: req.csrfToken()                      // csrf token
    });
})    

router.get('/list',redirectLogin, function(req, res, next) {
    if (req.session.userType == 'admin') {
        let sqlquery = "SELECT * FROM users" // query database to get all the users
        // execute sql query
        db.query(sqlquery, (err, result) => {
            if (err) {
                next(err)
            }
            let loggedInStatus = getLoggedInUser(req)
            res.render("userList.ejs", {userList:result,loggedInStatus})
        })
    }
    else res.redirect(ORIGIN_URL+"/")
})

router.get('/login', function(req, res, next) {
    const userInstruction = " "
    let loggedInStatus = getLoggedInUser(req)
    res.render('login.ejs', {userInstruction, loggedInStatus, crsfToken: req.csrfToken()}) 
})

router.post('/loggedin', loginRateLimiter, function(req, res, next) {
    const plainPassword = req.body.password;  // don't sanitize plain text password
    const email = req.sanitize(req.body.email);
    const userInstruction = "Login details are incorrect, please try again";

    // 500 error casued by the mysql timing out if the system had not been
    // used for a long time, so in tests everything worked fine 
    // but if the system was left unused, for a long time, then the db connection would give
    // this error  
    // Error: Can't add new command when connection is in closed state at Connection._addCommandClosedState 
    // and the app was not able to perform any db queries and so was not working
    // (even though the psages still displayed)
    // research into this shows I should be using connection pooling which is
    // is more efficient for a multi-user system and has mechanisms to reconnect
    // but it is too late to re-implement connection pooling and re-test
    // the /users/loggedin url
    // and the /users/registered url 
    // are the places that this error occurs in my testing this is because
    // if the system has been not used for a long time any user sessions will 
    // have expired OR the user will try to register. these are the only two 
    // points when a database query is executed after inactivity
    // so this is a workaround to check the db connection. and if disconnected
    // re-connect before executing the query.
    // testing to prove normal functionality is simple - testing that this 
    // works when the database is inactive takes more than 8 hours of waiting
    function executeQuery() {
        let sqlquery = "SELECT * FROM users WHERE email= ?";

        db.query(sqlquery, email, (err, dbresult) => {
            if (err) {
                console.error("logged in: sql to get password failed");
                next(err); 
            } else if (dbresult == null || dbresult.length === 0) {
                console.error("logged in: user not found in database");
                let loggedInStatus = getLoggedInUser(req);
                res.render('login.ejs', { userInstruction, loggedInStatus });
            } else {
                req.session.userType = dbresult[0].type;
                bcrypt.compare(plainPassword, dbresult[0].pwhash, function(err, result) {
                    if (err) {
                        console.error("logged in: compare of passwords failed");
                        next(err);
                    } else if (result == true) {
                        req.session.userEmail = dbresult[0].email;
                        req.session.userId = dbresult[0].id;
                        req.session.userType = dbresult[0].type;
                        let loggedInStatus = getLoggedInUser(req);
                        res.render('index.ejs', { loggedInStatus });
                        console.log("logged in: user: " + req.session.userEmail);
                    } else {
                        let loggedInStatus = getLoggedInUser(req);
                        res.render('login.ejs', {
                            userInstruction,
                            loggedInStatus,
                            crsfToken: req.csrfToken(),
                        });
                    }
                });
            }
        });
    }
    // check if the database connection is disconnected, and reconnect if needed
    if (!db || db.state === 'disconnected') {
        console.error('Database connection is disconnected. Trying to reconnect...');
        db.connect((err) => {
            if (err) {
                console.error('Database reconnection failed:', err);
                next(err); 
            } else {
                console.log('Database reconnected.');
                executeQuery();  // execute query and business logic 
            }
        });
    } else {
        executeQuery(); // execute query and business logic
    }
});
router.get('/logout', redirectLogin, (req,res) => {
    req.session.destroy(err => {
        if (err) {
        return res.redirect('index.ejs')
        }
        res.redirect(ORIGIN_URL+"/") // redirect to the home page with the links on it
    })
})

router.post('/registered', validateAndSanitiseUsers, function (req, res, next) {
    let loggedInStatus = getLoggedInUser(req)
    // check if validation errors and if yes then re-display page with old data and error messages
    if (req.validationErrors) {
        // debug to test data is there
        // res.json({ success: false, previousData: req.body, messages: req.validationErrors });
        // if there are errors then send the old data and the messages to the form
        // so they can be displayed
        return res.render('register.ejs', {
            loggedInStatus,
            previousData: req.body,
            messages: req.validationErrors,
            crsfToken: req.csrfToken()                      // csrf token
        });
    }
    else {
        const type = "customer"
        // separate out the register query and hash generation
        // so it can be called later after checking the database connection
        // see loggedin (which also uses this)
        function executeRegisterQuery() {
            // hash the pssword
            bcrypt.hash(req.body.password, saltRounds, function(err, hashedPassword) {
                // store hashed password in your database.
                let sqlquery = "INSERT INTO users (type, pwhash, email) VALUES (?,?,?)"
                let newrecord = [type, hashedPassword, req.body.email]
                db.query(sqlquery, newrecord, (err, result) => {
                    if (err) {
                        next(err)
                    }
                    else res.redirect(ORIGIN_URL+"/")
                })
            })   
        }
        // check if database is disconnected, if it is execute the registration code,
        // else connect to the database before executing the code
        if (!db || db.state === 'disconnected') {
            console.error('Database connection is closed. Trying to reconnect...');
            db.connect((err) => {
                if (err) {
                    console.error('Database reconnection failed:', err);
                    next(err); 
                } else {
                    console.log('Database reconnected');
                    executeRegisterQuery(); 
                }
            });
        } else {
            executeRegisterQuery(); 
        }                                                                    
    }
})

// Export the router object so index.js can access it
module.exports = router
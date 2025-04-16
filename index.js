// Import express, ejs, express-session and mysql
var express = require ('express')
var session = require ('express-session')
var validator = require ('express-validator');
const expressSanitizer = require('express-sanitizer');
const {ORIGIN_URL} = require('./helpers/getOriginURL');
var ejs = require('ejs')
var mysql = require('mysql2')
const csrf = require('csurf');                                // middleware for CSRF tokens

// Import dotenv so we can store secrets out of view of github
// and we can have different settings for production and development
require("dotenv").config();  

const app = express()                                         // Create the express application object
const port = 8000
app.set('view engine', 'ejs')                                 // Tell Express that we want to use EJS as the templating engine
app.use(expressSanitizer());                                  // Create an input sanitizer
app.use(express.urlencoded({ extended: true }))               // Set up the body parser 
app.use(express.static(__dirname + '/public'))                // Set up public folder (for css and static js)

// Security if we are in developement dont use https for the cookies
// but if we are live then use https for the cookies
// this failed testing on the uni server so I have reversed it
// if this was true the production server would not work so had to set back to false
// all routes that used session variables failed - I presume because it
// couldn't access the cookies over https.
let cookieSecure = false                                              
const url = new URL(ORIGIN_URL);
const cookieDomain = url.hostname;    // extracts the domain 
let cookiePath = url.pathname;        // extracts the path 
if (!cookiePath.endsWith('/')) {
    cookiePath += '/';
}
if (process.env.LIVE_SYSTEM.toLowerCase() == "false") {
    cookieSecure = false
}

// create a session
app.use(session({
    secret: process.env.SESSION_SECRET,       // use long session secret and keep in .env so not published on github
    name: process.env.SESSION_NAME,           // use a random session name so it's unpredictable for attackers, and put in .env
    resave: false,
    saveUninitialized: true,                  // the csrf for the /users views require an unautheticateed session otherwise this would be true
    cookie: {
          secure: cookieSecure,               // force https when on live server but not in development
          httpOnly: true,                     // cookie can't be set by javascript
 //         domain: cookieDomain,             // restricts cookie sending to just this domain - had to remove this as was not working on uni server, becsause of the way that localhost is published via apache?
 //         path: cookiePath,                 // restricts cookie sending to just the part of the path that has the routes - had to remove this as was not working on uni server, because of localhost published via apache?
          expires: 600000                     // 10 mins before re-login given this is financial information, this is an appropriate length
    }
}))

console.log(`Domain: ${cookieDomain} Path: ${cookiePath}`)
// Security.  Disable this http header to make it harder for attackers to know what technology is being used
app.disable('x-powered-by')   

// Define the database connection
// the .env file has these settings - so they are not stored in the source on github
let db;
db = mysql.createConnection ({
    host: process.env.LOCAL_HOST,
    user: process.env.LOCAL_USER,
    password: process.env.LOCAL_PASSWORD,
    database: process.env.LOCAL_DATABASE
});
console.log("Using Database. Host: " +process.env.LOCAL_HOST + ",  Database: " + process.env.LOCAL_DATABASE);

global.db = db
// reconnection logic with retry in case connection is lost because of inactivity
// this listens for any errors from db and reconnects if there are any
// references:  https://github.com/mysqljs/mysql/issues/375, 
//              https://codingtechroom.com/question/troubleshooting-mysql-auto-reconnect-issues-in-node-js-applications
const disconnect_retries = 6                            // how many attempts to reconnect after a disconnection is detected
const disconnect_retry_delay = 3000                     // how many ms to wait before trying to re-connect

function handleDisconnect(db) {
    let state = {retries: disconnect_retries}            
    db.on('error', function (err) {                     // listen for errors on the db
        console.error('Database error:', err)
        // check for all disconnection type codes plus error text (windows: 'The client was disconnected')
        // This differs based on platform and versions of node, mysql
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.message.toLowerCase().includes("lost") || err.message.toLowerCase().includes("closed") || err.message.toLowerCase().includes('the client was disconnected')) {
            if (state.retries > 0) {
                console.log(`Reconnecting... Attempts left: ${state.retries}`)
                db.destroy()
                const newConnection = mysql.createConnection(db.config)
                handleDisconnect(newConnection)                          // recursively call listening to the new connection, exit condition is no error
                global.db = newConnection                                // assingn new connection to global.db so no change to route code
                // manage connect retries
                setTimeout(() => {
                    newConnection.connect((err) => {
                        if (err) {
                            console.error('Reconnection failed:', err)
                            state.retries--
                        } else {
                            console.log('Reconnected to database.')
                            state.retries = disconnect_retries                // we have reconnected so re-set this so next time we get the same number of reconnection tries 
                        }
                    })
                }, disconnect_retry_delay)
            } else {
                console.error('Max reconnection attempts reached.')
                throw err
            }
        } else {
            throw err
        }
    })
}

// initial connection to the database
db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err)
        throw err
    }
    console.log('Connected to database.')
});

// listen for errors from db on the initial connection
handleDisconnect(db)

// Define our application-specific data
app.locals.appData = {appName: "Fund Tracker"}

// CSRF protection middleware
const csrfProtection = csrf({ cookie: false });                         // use a session-based token 

// Load the route handlers
const mainRoutes = require("./routes/main")
app.use('/', mainRoutes)                                                

// Load the route handlers for /users
const usersRoutes = require('./routes/users')
app.use('/users', csrfProtection, usersRoutes)

// Load the route handlers for /portfolios
const portfoliosRoutes = require('./routes/portfolios')
app.use('/portfolios', csrfProtection, portfoliosRoutes)

// Load the route handlers for /transactions
const transactionsRoutes = require('./routes/transactions')
app.use('/transactions', csrfProtection, transactionsRoutes)

// Load the route handlers for /funds
const fundsRoutes = require('./routes/funds')
app.use('/funds',csrfProtection, fundsRoutes)

// Load the route handlers for /prices
const pricesRoutes = require('./routes/prices')
app.use('/prices', pricesRoutes)

// Load the route handlers for /prices
const apiRoutes = require('./routes/api')
app.use('/api', apiRoutes)

// security. if the user is posting a form that has a cross site request forgery
// token in it and that is not valid (session has expired / they are using a page
// that has been loaded a long time ago / they are attempting a cross site request
// forgery) there is an error that is generated (and the post fails)
// so catch this error if it happens, and re-direct the user to the login page
// which will be the correct next action. If this is not here a 500 error would be 
// produced.
// left this custom error page implemented here to demonstrate CSRF invalid tokens being handled 
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
      res.status(403).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">        
                <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
                <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined">                <title>Expired CSRF</title>
                <script>
                    let countdown = 2;                              // starting countdown timer value
                    function updateCountdown() {
                        const countdownElement = document.getElementById('countdown');
                        countdownElement.textContent = countdown;
                        if (countdown <= 0) {
                            window.location.href = '` + ORIGIN_URL + `/users/login';  // redirect to login page
                        } else {
                            countdown--;
                            setTimeout(updateCountdown, 1000);      // update every second
                        }
                    }
                    window.onload = updateCountdown;                // start countdown on page load
                </script>
            </head>
            <body>
                <h1><span class="material-symbols-outlined">error</span> Invalid CSRF token</h1>
                <p>The CSRF token has expired.</p>
                <p>Redirecting to the login page in <span id="countdown">2</span> seconds...</p>
                <p>If you are not redirected, <a href="/users/login">click here</a>.</p>
            </body>
            </html>
        `);
      } else {
      next(err); 
  }
});

// security. custom 404 so default will not give away we are using express
app.use((req, res, next) => {
  res.status(404).send("That resouce cannot be found")
})

// security. custom error so default will not give away we are using express
app.use((err, req, res, next) => {
  console.error(err.stack)
//  res.status(500).send('An error has occured\n' + err.code + '\n' + err.stack + '\n' + err.message + '\n')
  res.status(500).send('An error has occured')

})

// Start the web app listening
app.listen(port, () => console.log(`Node app listening on port ${port}!`))
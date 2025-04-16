// Import express, ejs, express-session and mysql
var express = require ('express')
var session = require ('express-session')
var validator = require ('express-validator');
const expressSanitizer = require('express-sanitizer');
const {ORIGIN_URL} = require('./helpers/getOriginURL');
var ejs = require('ejs')
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


// TEsting only
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      req.session.userId = 'dev-user-id';
      req.session.userEmail = 'dev@example.com';
      req.session.userType = 'admin';
    }
    next();
});

console.log(`Domain: ${cookieDomain} Path: ${cookiePath}`)
// Security.  Disable this http header to make it harder for attackers to know what technology is being used
app.disable('x-powered-by')   

const firebase = require('./firebaseAdmin');
global.db = firebase;

// testing
firebase.collection('Ingredients').limit(1).get()
  .then(snapshot => {
    console.log(`[Firestore] Connected. Found ${snapshot.size} ingredients`);
  })
  .catch(err => {
    console.error('[Firestore] Connection failed:', err);
  });


// Define our application-specific data
app.locals.appData = {appName: "Food Manager Admin"}

// CSRF protection middleware
const csrfProtection = csrf({ cookie: false });                         // use a session-based token 

// Load the route handlers
const mainRoutes = require("./routes/main")
app.use('/', mainRoutes)                                                

const ingredientsRoutes = require('./routes/ingredients');
app.use('/ingredients', csrfProtection, ingredientsRoutes);

// Load the route handlers for /users
const usersRoutes = require('./routes/users')
app.use('/users', csrfProtection, usersRoutes)


// Start the web app listening
app.listen(port, () => console.log(`Node app listening on port ${port}!`))
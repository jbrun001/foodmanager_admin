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
const port = 8080
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
let cookieSecure = false;
let cookieDomain = '';
let cookiePath = '/';

if (ORIGIN_URL) {
  try {
    const url = new URL(ORIGIN_URL);
    cookieDomain = url.hostname;
    cookiePath = url.pathname;
    if (!cookiePath.endsWith('/')) {
      cookiePath += '/';
    }
  } catch (err) {
    console.error('Invalid ORIGIN_URL:', ORIGIN_URL);
  }
}
if (process.env.LIVE_SYSTEM?.toLowerCase() === "true") {
  cookieSecure = true;
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
          expires: 3600000                    // 1 hour before session times out
    }
}))

/*
// testing only
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      req.session.userId = 'dev-user-id';
      req.session.userEmail = 'dev@123.com';
      req.session.userType = 'admin';
    }
    next();
});
*/
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

const recipesRoutes = require('./routes/recipes');
app.use('/recipes', csrfProtection, recipesRoutes);

// Load the route handlers for /users - remove csrf protection because now using google sign in
const usersRoutes = require('./routes/users')
app.use('/users', usersRoutes)

const reportsRoutes = require('./routes/reports');
app.use('/reports', csrfProtection, reportsRoutes);

const scrapeRoutes = require('./routes/scrapes');
app.use('/scrapes', csrfProtection, scrapeRoutes);

const configRoutes = require('./routes/config');
app.use('/config', csrfProtection, configRoutes);

const storageAdviceRoutes = require('./routes/storageAdvice');
app.use('/storageAdvice', csrfProtection, storageAdviceRoutes);

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

// Start the web app listening
app.listen(port, () => console.log(`Node app listening on port ${port}!`))
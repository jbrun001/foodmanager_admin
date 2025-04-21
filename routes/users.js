// Create a new router
const express = require("express")
const router = express.Router()
const { validateAndSanitiseUsers } = require('../helpers/validateAndSanitiseInput');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin} = require('../helpers/redirectLogin')
const bcrypt = require('bcrypt')
const saltRounds = 10
// create oauthclient  https://expertbeacon.com/authenticating-users-with-the-google-auth-library-for-node-js/
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Security. Import express-rate-limit so we can stop brute forcing
// of the login
const rateLimit = require('express-rate-limit');
const loginRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,            // 1 minute before retry
    max: 5,                             // limit each IP to 5 login attempts per minute
    message: "{error:'Rate Limited', message: 'Too many login attempts, please try again after 1 minute.'}"
});


// see login.ejs for the call to this page when happens from https://accounts.google.com/gsi/client
// access blocked authentication error fix:
// https://console.cloud.google.com/apis/credentials?hl=en&project=foodmanager-f117f
// select edit oAuth2 web client
// add the URL in the authorised javascript origins i,e, http://localhost:8000
// add the call back url in the section below that i.e http://localhost:8000/users/oauth-callback 
router.post('/oauth-callback', express.json(), async (req, res, next) => {
    try {
        const token = req.body.credential;
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const email = payload.email;
        const uid = payload.sub;

        console.log("Google UID:", uid);
        console.log("Google email:", email);

        // check firestore for admin role
        const doc = await db.collection('Users').doc(uid).get();
        if (!doc.exists || doc.data().role !== 'admin') {
            return res.status(403).send('Access denied. Admins only.');
        }


        // set session
        req.session.userId = uid;
        req.session.userEmail = email;
        req.session.userType = 'admin';

        console.log(`User logged in via Google: ${email}`);
        return res.redirect('/');
    } catch (err) {
        console.error('Google Sign-in error:', err);
        return res.status(500).send('Authentication failed');
    }
});

router.get('/login', function(req, res, next) {
    const userInstruction = " "
    let loggedInStatus = getLoggedInUser(req)
    res.render('login.ejs', {userInstruction, loggedInStatus}) 
})

router.get('/logout', redirectLogin, (req,res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('index.ejs')
        }
        res.redirect(ORIGIN_URL + "/") // redirect to home page
    })
})

// Export the router object so index.js can access it
module.exports = router
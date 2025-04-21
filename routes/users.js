// Create a new router
const express = require("express")
const router = express.Router()
const { validateAndSanitiseUsers } = require('../helpers/validateAndSanitiseInput');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL')
const { redirectLogin} = require('../helpers/redirectLogin')
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

// route to display users and details about users
router.get('/manage', redirectLogin, async (req, res, next) => {
    const loggedInStatus = getLoggedInUser(req);
    try {
        // get all the users
        const usersSnapshot = await db.collection('Users').get();
        const usersData = [];
        // for each user
        for (const doc of usersSnapshot.docs) {
            const uid = doc.id;
            const userInfo = doc.data();
            let authProvider = 'unknown';
            // leave out getting how user logged in for now not critical
            /*
            try {
                // https://firebase.google.com/docs/auth/admin/manage-users
                // get userid
                const userRecord = await admin.auth().getUser(uid);
                // https://stackoverflow.com/questions/39291878/firebase-auth-get-provider-id
                // get how the user logs in
                const providerId = userRecord.providerData[0]?.providerId;
                authProvider = providerId === 'google.com' ? 'Google' :
                                providerId === 'password' ? 'Email/Password' :
                                providerId || 'Unknown';
            } catch (e) {
                console.warn(`could not get auth info for user ${uid}: ${e.message}`);
            }
            */
            // count how many records this user has in each of these collections using .size
            // for information, and put the info into an object
            const collections = ['MealPlans', 'SmartLists', 'StockItems', 'WasteLogs'];
            const stats = {};
            for (const col of collections) {
                try {
                    const colSnap = await db.collection(`Users/${uid}/${col}`).get();
                    stats[col] = colSnap.size;
                } catch (err) {
                    stats[col] = 'Error';
                }
            }
    
            // create object to send to the ejs for display
            // the ...stats spread will insert value pairs from the stats array
            /* for example
            {
                uid: "user123",
                email: "jake@example.com",
                role: "admin",
                authProvider: "Google",
                MealPlans: 4,
                SmartLists: 2,
                StockItems: 8,
                WasteLogs: 1
            } */
            usersData.push({
                uid,
                email: userInfo.email,
                role: userInfo.role || 'customer',
                authProvider,
                ...stats
            });
        }
    
        res.render('userManage.ejs', {
            loggedInStatus,
            users: usersData,
            //crsfToken: req.csrfToken()
        });
    } catch (err) {
      console.error("Error in /users/manage:", err);
      res.status(500).send("Failed to load users.");
    }
});

// change user role but block changing logged in admin user
router.post('/:userId/role', redirectLogin, async (req, res, next) => {
    const loggedInStatus = getLoggedInUser(req);
    const { userId } = req.params;
    const { newRole } = req.body;
  
    if (req.session.userType !== 'admin') {
      return res.status(403).send("Only admins can update user roles");
    }
  
    if (!['admin', 'customer'].includes(newRole)) {
      return res.status(400).send("Invalid role");
    }
  
    // Prevent demoting self
    if (req.session.userId === userId && newRole !== 'admin') {
      return res.status(400).send("You cannot change your own role to customer.");
    }
  
    try {
      const userRef = db.collection('Users').doc(userId);
      const userSnap = await userRef.get();
  
      if (!userSnap.exists) {
        return res.status(404).send("User not found");
      }
  
      await userRef.update({ role: newRole });
      console.log(`Updated role for ${userId} to ${newRole}`);
      res.redirect('/users/manage');
    } catch (err) {
      console.error(`Error updating user role for ${userId}:`, err);
      next(err);
    }
});

// delete user - can't delete ourselves
router.post('/:userId/delete', redirectLogin, async (req, res, next) => {
    const { userId } = req.params;
    if (req.session.userId === userId) {
        return res.status(400).send("You cannot delete your own account.");
    }

    if (req.session.userType !== 'admin') {
         return res.status(403).send("Only admins can delete users");
    }
  
    try {
        // delete subcollections 
        const subcollections = ['MealPlans', 'SmartLists', 'StockItems', 'WasteLogs', 'AddedRecipes'];
        for (const sub of subcollections) {
            const snapshot = await db.collection(`Users/${userId}/${sub}`).get();
            const batch = db.batch();
            // https://stackoverflow.com/questions/48175235/how-to-delete-multiple-documents-from-cloud-firestore
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    
        // delete firestore user profile
        await db.collection('Users').doc(userId).delete();
    
        console.log(`Deleted user ${userId} and their data`);
        res.redirect('/users/manage');
        
    } catch (err) {
        console.error(`Error deleting user ${userId}:`, err);
        next(err);
    }
});
  
  
  

// Export the router object so index.js can access it
module.exports = router
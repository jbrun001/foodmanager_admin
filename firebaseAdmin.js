const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Your Firebase credentials

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://<your-database>.firebaseio.com'
});

const db = admin.firestore();
module.exports = db;
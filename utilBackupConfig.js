const admin = require('firebase-admin');
const path = require('path');

// Load your Firebase credentials (adjust filename as needed)
const serviceAccount = require(path.join(__dirname, './serviceAccountKey.json'));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function backupFlutterappConfig() {
  try {
    const configDoc = await db.collection('Config').doc('flutterapp').get();

    if (!configDoc.exists) {
      console.log('[!] No "flutterapp" config found.');
      return;
    }

    const data = configDoc.data();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDocId = `flutterapp_backup_${timestamp}`;

    await db.collection('Config').doc(backupDocId).set(data);
    console.log(`[✓] Backup created as /Config/${backupDocId}`);
  } catch (err) {
    console.error('[✗] Error during backup:', err);
  }
}

backupFlutterappConfig();

// fixUndefinedRecipe.js

const admin = require('firebase-admin');
const path = require('path');

// Load your Firebase credentials (update the path if needed)
const serviceAccount = require(path.join(__dirname, './'));

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixUndefinedRecipe() {
  try {
    const undefinedDoc = await db.collection('recipes').doc('undefined').get();

    if (!undefinedDoc.exists) {
      console.log('[!] No "undefined" recipe found.');
      return;
    }

    const data = undefinedDoc.data();

    // Add to a new document with a new auto-generated ID
    const newRef = await db.collection('recipes').add(data);
    console.log(`[✓] Recipe copied to new ID: ${newRef.id}`);

    // Optionally delete the old one
    await db.collection('recipes').doc('undefined').delete();
    console.log('[✓] Deleted original "undefined" recipe.');

  } catch (err) {
    console.error('[✗] Error during fix:', err);
  }
}

fixUndefinedRecipe();

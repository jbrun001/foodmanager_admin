const express = require('express');
const router = express.Router();
const db = require('../firebaseAdmin');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { redirectLogin } = require('../helpers/redirectLogin');

// INDEX: List all storage types
router.get('/', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const snapshot = await db.collection('StorageAdvice').get();
  const types = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  res.render('storageAdviceIndex.ejs', {
    types,
    loggedInStatus,
    crsfToken: req.csrfToken()
  });
});

// EDIT TYPE: Show edit page for one category
router.get('/edit/:typeId', redirectLogin, async (req, res) => {
    const loggedInStatus = getLoggedInUser(req);
    const typeId = req.params.typeId;

    // get the ingredients for the select box
    const ingredientsSnapshot = await db.collection('Ingredients').get();
    const allIngredients = ingredientsSnapshot.docs.map(doc => doc.data().name);

    const doc = await db.collection('StorageAdvice').doc(typeId).get();
    if (!doc.exists) return res.status(404).send('Type not found');

    res.render('storageAdviceEdit.ejs', {
    typeId,
    generalAdvice: doc.data().generalAdvice || '',
    entries: doc.data().entries || [],
    allIngredients,
    loggedInStatus,
    crsfToken: req.csrfToken()
    });

});

// UPDATE TYPE: Submit changes to general advice and entries
router.post('/edit/:typeId', redirectLogin, async (req, res) => {
  const typeId = req.params.typeId;
  const { generalAdvice, entriesJson } = req.body;

  try {
    const entries = JSON.parse(entriesJson); // should be an array of { ingredient, advice, test, lifeDays }
    await db.collection('StorageAdvice').doc(typeId).set({ generalAdvice, entries });
    res.redirect('/storageAdvice');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update storage advice');
  }
});

// temp load of /data/storageAdvice.json
// uncomment if new bulk load required
/*
router.get('/dev/load-data', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const fixtureData = require('../data/storageAdvice.json'); 

  try {
    const batch = db.batch();
    fixtureData.forEach(item => {
      const docRef = db.collection('StorageAdvice').doc(item.id);
      batch.set(docRef, {
        generalAdvice: item.generalAdvice,
        entries: item.entries
      });
    });

    await batch.commit();
    res.send('Data loaded into Firestore.');
  } catch (err) {
    console.error('Error loading data:', err);
    res.status(500).send('Failed to load data.');
  }
});
*/

module.exports = router;

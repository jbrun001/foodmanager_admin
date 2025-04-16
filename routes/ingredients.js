const express = require('express');
const router = express.Router();
const db = require('../firebaseAdmin');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { redirectLogin } = require('../helpers/redirectLogin');

router.get('/review-moqs', redirectLogin, async (req, res, next) => {
  const loggedInStatus = getLoggedInUser(req);
  try {
    const snapshot = await db.collection('Ingredients').get();
    const ingredientsWithBlankURLs = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const moqs = data.Moqs || [];
      moqs.forEach((moq, index) => {
        if (!moq.URL || moq.URL.trim() === '') {
          ingredientsWithBlankURLs.push({
            ingredientId: doc.id,
            ingredientName: data.name,
            moqIndex: index,
            ...moq
          });
        }
      });
    });

    res.render('ingredientsReview.ejs', {
      ingredients: ingredientsWithBlankURLs,
      loggedInStatus,
      crsfToken: req.csrfToken()
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.get('/edit-moq/:ingredientId/:moqIndex', redirectLogin, async (req, res, next) => {
  const loggedInStatus = getLoggedInUser(req);
  try {
    const { ingredientId, moqIndex } = req.params;
    const doc = await db.collection('Ingredients').doc(ingredientId).get();
    const data = doc.data();
    const moq = data.Moqs[parseInt(moqIndex)];

    res.render('ingredientsEditMoq.ejs', {
      ingredientId,
      moqIndex,
      ingredientName: data.name,
      moq,
      loggedInStatus,
      crsfToken: req.csrfToken()
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

router.post('/edit-moq/:ingredientId/:moqIndex', redirectLogin, async (req, res, next) => {
  try {
    const { ingredientId, moqIndex } = req.params;
    const { URL, amount, storeName, units } = req.body;
    const docRef = db.collection('Ingredients').doc(ingredientId);
    const doc = await docRef.get();
    const data = doc.data();
    
    const moqs = data.Moqs || [];
    const index = parseInt(moqIndex);

    moqs[index] = {
      ...moqs[index],
      URL,
      amount: parseFloat(amount),
      storeName,
      units
    };

    await docRef.update({ Moqs: moqs });

    res.redirect('/ingredients/review-moqs');

  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;

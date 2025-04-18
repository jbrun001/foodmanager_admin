const express = require('express');
const router = express.Router();
const db = require('../firebaseAdmin');
const { redirectLogin } = require('../helpers/redirectLogin');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');

// Recipe input page
router.get('/add', redirectLogin, (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  res.render('recipesAdd', {
    loggedInStatus,
    crsfToken: req.csrfToken(),
    previousData: '',
    messages: []
  });
});

router.post('/add', redirectLogin, async (req, res) => {
  const rawInput = req.body.recipeJson || '';
  let parsed;

  try {
    parsed = JSON.parse(rawInput);
  } catch (err) {
    return res.render('recipesAdd', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      previousData: rawInput,
      messages: [{ field: 'recipeJson', message: 'Invalid JSON format' }]
    });
  }

  // check JSON format
  if (!Array.isArray(parsed)) {
    return res.render('recipesAdd', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      previousData: rawInput,
      messages: [{ field: 'recipeJson', message: 'Input must be a JSON array of recipes.' }]
    });
  }

  const requiredFields = ['title', 'ingredients', 'method'];
  const results = [];
  const duplicates = [];
  const invalids = [];

  for (const recipe of parsed) {
    // validate fields
    const missing = [];
    requiredFields.forEach(field => {
    if (!recipe.hasOwnProperty(field) || recipe[field] === null || recipe[field] === '') {
      missing.push(field);
    }
  });

  if (missing.length > 0) {
    invalids.push({
      title: recipe.title || '[No Title]',
      reason: `Missing required fields: ${missing.join(', ')}`
    });
    continue;
  }

  // check for duplicates by title
  const existing = await db.collection('recipes')
    .where('title', '==', recipe.title)
    .limit(1)
    .get();

  if (!existing.empty) {
    duplicates.push(recipe.title);
      continue;
  }

  // save to Firestore
  await db.collection('recipes').add(recipe);
  results.push(recipe.title);
  }

  // build message summary
  const messages = [];

  if (results.length > 0) {
    messages.push({
      field: 'success',
      message: `${results.length} recipe(s) saved: ${results.join(', ')}`
    });
  }

  if (duplicates.length > 0) {
    messages.push({
    field: 'duplicate',
    message: `Duplicate recipe title(s) skipped: ${duplicates.join(', ')}`
    });
  }

  if (invalids.length > 0) {
    invalids.forEach(bad => {
    messages.push({
      field: 'invalid',
      message: `Recipe "${bad.title}" skipped — ${bad.reason}`
    });
    });
}

return res.render('recipesAdd', {
    loggedInStatus,
    crsfToken: req.csrfToken(),
    previousData: '',
    messages
});
  });

router.get('/fixThumbnails', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const snapshot = await db.collection('recipes').get();

  const affected = [];

  // filter blank or URLS with 'dummy' in them
  snapshot.forEach(doc => {
    const recipe = doc.data();
    const title = recipe.title || '[Untitled]';
    const thumbnail = recipe.thumbnail || '';
    const image = recipe.image || '';

    if (
      !thumbnail ||
      !image ||
      thumbnail.includes('dummy') ||
      image.includes('dummy')
      ) {
      affected.push({
          id: doc.id,
          title,
          thumbnail,
          image
      });
  }
});
  
  res.render('recipeFixThumbnails.ejs', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      affected
    });
});

// update of one recope
router.post('/fixThumbnails/:recipeId', redirectLogin, async (req, res) => {
  const { thumbnail, image } = req.body;
  const { recipeId } = req.params;

  try {
    await db.collection('recipes').doc(recipeId).update({
      thumbnail: thumbnail.trim(),
      image: image.trim()
    });

    res.send(`<p>Recipe "${recipeId}" updated`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update recipe thumbnails.');
  }
});


module.exports = router;

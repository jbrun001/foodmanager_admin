const express = require('express');
const router = express.Router();
const db = require('../firebaseAdmin');
const { redirectLogin } = require('../helpers/redirectLogin');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');

router.get('/', redirectLogin, (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  res.render('recipesIndex', { loggedInStatus });
});


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

router.get('/add/form', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  const ingredientsSnapshot = await db.collection('Ingredients').get();
  const ingredientNames = ingredientsSnapshot.docs.map(doc => {
    const data = doc.data();
    return { name: data.name, unit: data.unit || '' };
  });

  res.render('recipesEdit', {
    loggedInStatus,
    crsfToken: req.csrfToken(),
    recipe: {
      title: '',
      thumbnail: '',
      image: '',
      description: '',
      cooktime: '',
      preptime: '',
      calories: '',
      portions: '',
      cusine: '',
      category: '',
      keywords: '',
      ingredients: [],
      method: [],
      additional_ingredients: []
    },
    messages: [],
    isAddMode: true,
    ingredientNames
  });
});



router.post('/add/form', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  // Fetch ingredients to pass into the template
  const ingredientsSnapshot = await db.collection('Ingredients').get();
  const ingredientNames = ingredientsSnapshot.docs.map(doc => {
    const data = doc.data();
    return { name: data.name, unit: data.unit || '' };
  }).sort((a, b) => a.name.localeCompare(b.name));

  try {
    const newRecipe = {
      title: req.body.title,
      thumbnail: req.body.thumbnail,
      image: req.body.image,
      description: req.body.description,
      cooktime: parseInt(req.body.cooktime),
      preptime: parseInt(req.body.preptime),
      calories: parseInt(req.body.calories),
      portions: parseInt(req.body.portions),
      cusine: req.body.cusine,
      category: req.body.category,
      keywords: req.body.keywords,
      ingredients: Array.isArray(req.body.ingredients) ? req.body.ingredients.map(i => ({
        ingredient_id: parseInt(i.ingredient_id),
        ingredient_name: i.ingredient_name,
        amount: parseFloat(i.amount),
        unit: i.unit
      })) : [],
      method: Array.isArray(req.body.method) ? req.body.method.map(m => ({
        step: m.step,
        image: m.image || ''
      })) : [],
      additional_ingredients: req.body.additional_ingredients
        ? req.body.additional_ingredients.split(',').map(s => s.trim())
        : []
    };

    const existing = await db.collection('recipes').where('title', '==', newRecipe.title).limit(1).get();
    if (!existing.empty) {
      return res.render('recipesEdit', {
        loggedInStatus,
        crsfToken: req.csrfToken(),
        recipe: newRecipe,
        isAddMode: true,
        ingredientNames,
        messages: [{ field: 'duplicate', message: 'Recipe with this title already exists' }]
      });
    }

    const docRef = await db.collection('recipes').add(newRecipe);
    newRecipe.id = docRef.id; // inject ID for future edits

    res.render('recipesEdit', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      recipe: newRecipe,
      isAddMode: false, // important — it's now treated as an existing recipe
      ingredientNames,
      messages: [{ field: 'success', message: 'New recipe added successfully' }]
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to add recipe');
  }
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

router.get('/edit/:id', redirectLogin, async (req, res) => {
  const recipeId = req.params.id;
  const loggedInStatus = getLoggedInUser(req);

  try {
    const doc = await db.collection('recipes').doc(recipeId).get();
    if (!doc.exists) return res.status(404).send('Recipe not found');

    const recipe = doc.data();
    recipe.id = doc.id;

    const ingredientsSnapshot = await db.collection('Ingredients').get();
    const ingredientNames = ingredientsSnapshot.docs.map(doc => {
      const data = doc.data();
      return { name: data.name, unit: data.unit || '' };
    }).sort((a, b) => a.name.localeCompare(b.name));

    res.render('recipesEdit', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      recipe,
      messages: [],
      isAddMode: false,
      ingredientNames
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving recipe');
  }
});


router.post('/edit/:id', redirectLogin, async (req, res) => {
  const recipeId = req.params.id;
  const loggedInStatus = getLoggedInUser(req);

  try {
    const updatedRecipe = {
      title: req.body.title,
      thumbnail: req.body.thumbnail,
      image: req.body.image,
      description: req.body.description,
      cooktime: parseInt(req.body.cooktime),
      preptime: parseInt(req.body.preptime),
      calories: parseInt(req.body.calories),
      portions: parseInt(req.body.portions),
      cusine: req.body.cusine,
      category: req.body.category,
      keywords: req.body.keywords,
      ingredients: Array.isArray(req.body.ingredients) ? req.body.ingredients.map(i => ({
        ingredient_id: parseInt(i.ingredient_id),
        ingredient_name: i.ingredient_name,
        amount: parseFloat(i.amount),
        unit: i.unit
      })) : [],
      method: Array.isArray(req.body.method) ? req.body.method.map(m => ({
        step: m.step,
        image: m.image || ''
      })) : [],
      additional_ingredients: req.body.additional_ingredients
        ? req.body.additional_ingredients.split(',').map(s => s.trim())
        : []
    };

    await db.collection('recipes').doc(recipeId).set(updatedRecipe, { merge: true });

    const ingredientsSnapshot = await db.collection('Ingredients').get();
    const ingredientNames = ingredientsSnapshot.docs.map(doc => {
      const data = doc.data();
      return { name: data.name, unit: data.unit || '' };
    }).sort((a, b) => a.name.localeCompare(b.name));

    res.render('recipesEdit', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      recipe: updatedRecipe,
      messages: [{ field: 'success', message: 'Recipe updated successfully' }],
      isAddMode: false,
      ingredientNames
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update recipe');
  }
});


router.get('/search', redirectLogin, (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  res.render('recipesSearch', {
    loggedInStatus,
    crsfToken: req.csrfToken(),
    results: [],
    query: ''
  });
});

router.post('/search', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const query = req.body.query.trim().toLowerCase();
  const snapshot = await db.collection('recipes').get();

  const results = [];

  snapshot.forEach(doc => {
    const recipe = doc.data();
    const title = recipe.title.toLowerCase();
    const keywords = (recipe.keywords || '').toLowerCase();
    const ingredients = (recipe.ingredients || []).map(i => i.ingredient_name.toLowerCase()).join(', ');

    if (title.includes(query) || keywords.includes(query) || ingredients.includes(query)) {
      results.push({
        id: doc.id,
        title: recipe.title,
        thumbnail: recipe.thumbnail || '',
      });
    }
  });

  res.render('recipesSearch', {
    loggedInStatus,
    crsfToken: req.csrfToken(),
    results,
    query: req.body.query
  });
});



module.exports = router;

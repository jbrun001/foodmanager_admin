const express = require('express');
const router = express.Router();
const db = require('../firebaseAdmin');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { redirectLogin } = require('../helpers/redirectLogin');
const stringSimilarity = require('string-similarity'); 


router.get('/', redirectLogin, (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  res.render('ingredientsIndex', { loggedInStatus });
});


// lists all the ingredients with a blank MOQ URL and a link to an edit page
// so it's easier to do the data entry for this information
// and to check if any ingredients are missing this data
router.get('/review-moqs', redirectLogin, async (req, res, next) => {
  const loggedInStatus = getLoggedInUser(req);
  try {
    // get all the ingredients from the database put it in snapshot
    const snapshot = await db.collection('Ingredients').get();
    // array to hold any with a blank url
    const ingredientsWithBlankURLs = [];

    // loop through all ingredients 
    snapshot.forEach(doc => {
      const data = doc.data();          // get the full ingredient document
      const moqs = data.Moqs || [];     // extract the MOQ part

      // loop through each MOQ in this Ingredient
      moqs.forEach((moq, index) => {
        // is the URL blank?
        if (!moq.URL || moq.URL.trim() === '') {
          // push this moq information into our results
          ingredientsWithBlankURLs.push({
            ingredientId: doc.id,           // add doc.id will need when we updating
            ingredientName: data.name,      // add ingredient name will need this for display
            moqIndex: index,                // add index, will need this when updating
            ...moq                          // spread - include all other fields from MOQ
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

// display route
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

// update route
router.post('/edit-moq/:ingredientId/:moqIndex', redirectLogin, async (req, res, next) => {
  try {
    const { ingredientId, moqIndex } = req.params;
    const { URL, amount, storeName, units } = req.body;
    // search for ingredientId and store the database reference
    const docRef = db.collection('Ingredients').doc(ingredientId);
    // get the whole ingredient document (including MOQ)
    const doc = await docRef.get();
    // get the data from the doc
    const data = doc.data();
    // get just the moq part - if none then return []
    const moqs = data.Moqs || [];
    // make sure the number we were passed in an integer
    const index = parseInt(moqIndex);

   
    // Update the specific MOQ entry at the specified index
    // use ... (spread) to create a copy of the original then overwrite
    // with the specified values (so any other original fields stay the same)
    moqs[index] = {
      ...moqs[index],           // spread
      URL,
      amount: parseFloat(amount),
      storeName,
      units
    };

    // save the MOQ including changes back to database
    await docRef.update({ Moqs: moqs });

    res.redirect('/ingredients/review-moqs');

  } catch (err) {
    console.error(err);
    next(err);
  }
});


router.get('/updateIngredients', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const now = new Date().toISOString();
  const processed = new Set();
  const results = [];

  try {
    const recipesSnapshot = await db.collection('recipes').get();

    for (const doc of recipesSnapshot.docs) {
      const recipe = doc.data();
      const ingredients = recipe.ingredients || [];

      for (const ing of ingredients) {
        const name = (ing.ingredient_name || '').trim();
        if (!name || processed.has(name)) continue;
        processed.add(name);

        const type = guessType(name);
        const unit = ing.unit || 'g';

        const placeholderMoq = {
          amount: 99,
          units: unit,
          storeName: 'Tesco',
          URL: '',
          lastCollected: now,
        };

        const docRef = db.collection('Ingredients').doc(name);
        const existing = await docRef.get();

        if (!existing.exists) {
          await docRef.set({
            name,
            unit,
            type,
            Moqs: [placeholderMoq]
          });
          results.push({ name, status: 'created', message: `Created "${name}" with placeholder MOQ` });
        } else {
          const moqs = existing.data()?.Moqs || [];
          if (moqs.length > 0) {
            results.push({ name, status: 'skipped', message: `"${name}" already has MOQ, skipping` });
            continue;
          }

          await docRef.update({
            Moqs: admin.firestore.FieldValue.arrayUnion(placeholderMoq)
          });
          results.push({ name, status: 'updated', message: `Added placeholder MOQ to "${name}"` });
        }
      }
    }

    res.render('ingredientsUpdated.ejs', {
      loggedInStatus,
      results,
      crsfToken: req.csrfToken()
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate ingredients');
  }
});


function guessType(name) {
  const lower = name.toLowerCase().trim();
  const typeKeywords = {
    meat: ['chicken', 'beef', 'pork', 'mince', 'thigh', 'steak', 'sausage', 'bacon', 'loin'],
    fish: ['haddock', 'salmon', 'cod', 'tuna', 'mackerel', 'bass', 'sea bass', 'basa', 'fillet'],
    vegetable: ['potato', 'carrot', 'onion', 'pak choi', 'broccoli', 'lettuce', 'pepper', 'tomato',
                'cucumber', 'mushroom', 'courgette', 'chilli', 'beetroot', 'shallot', 'slaw', 'greens',
                'mooli', 'cabbage', 'spring onion', 'spring onions', 'green beans', 'rocket', 'gem lettuce', 'mangetout'],
    'spices & pastes': ['paste', 'ginger', 'garlic', 'spice', 'herb', 'chili', 'paprika', 'cumin',
                        'turmeric', 'cinnamon', 'cardamom', 'bayleaf', 'lemongrass', 'sumac', 'ras el hanout',
                        'five-spice', 'sambal', 'jerk', 'harissa',  'garlic paste', 'ginger paste', 'roasted garlic'],
    dairy: ['milk', 'cheese', 'butter', 'yogurt', 'cream', 'feta', 'goat cheese', 'mayonnaise'],
    baking: ['flour', 'yeast', 'sugar', 'baking powder', 'bicarbonate', 'sultanas'],
    'world goods': ['rice', 'noodle', 'soy', 'sriracha', 'wrap', 'linguine', 'tortilla', 'vinegar',
                    'tamari', 'couscous', 'quinoa', 'bulgur', 'pho', 'hoisin', 'ketchup'],
    'nuts & seeds': ['peanut', 'peanuts', 'sesame', 'pumpkin seeds', 'nigella'],
    legumes: ['lentils', 'chickpeas'],
    condiments: ['oil', 'vinegar', 'sauce', 'paste', 'stock', 'broth', 'tamari', 'hoisin', 'ketchup'],
    misc: ['tofu', 'egg', 'wrap', 'slaw', 'noodle', 'coconut', 'onions', 'crispy onions',
           'peanut butter',]
  };

  for (const [type, keywords] of Object.entries(typeKeywords)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return type;
    }
  }

  return 'General';
}


router.get('/reviewDuplicates', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const snapshot = await db.collection('Ingredients').get();

  const ingredients = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  const possibleDuplicates = [];

  // check for similar ingredients
  for (let i = 0; i < ingredients.length; i++) {
    for (let j = i + 1; j < ingredients.length; j++) {
      const nameA = ingredients[i].name.toLowerCase();
      const nameB = ingredients[j].name.toLowerCase();
      const similarity = stringSimilarity.compareTwoStrings(nameA, nameB);

      if (similarity >= 0.45 && nameA !== nameB) {
        possibleDuplicates.push({
          a: ingredients[i],
          b: ingredients[j],
          similarity: Math.round(similarity * 100)
        });
      }
    }
  }

  res.render('ingredientDuplicates.ejs', {
    loggedInStatus,
    duplicates: possibleDuplicates,
    crsfToken: req.csrfToken()
  });
});


const unitConversionTable = {
  'test': 150
};


router.get('/mergePreview', redirectLogin, async (req, res) => {
  const fromName = req.query.from?.trim();
  const toName = req.query.to?.trim();
  const loggedInStatus = getLoggedInUser(req);

  if (!fromName || !toName) {
    return res.status(400).send('Missing "from" or "to" query parameter.');
  }

  const unitConversionTable = {
    '': 150,
  };

  const recipesSnapshot = await db.collection('recipes').get();
  const affectedRecipes = [];

  recipesSnapshot.forEach(doc => {
    const data = doc.data();
    const recipeId = doc.id;
    const title = data.title;
    const updates = [];

    const ingredients = data.ingredients || [];

    ingredients.forEach(ing => {
      const nameMatch = ing.ingredient_name?.trim() === fromName;
      if (nameMatch) {
        const original = { ...ing };
        const converted = { ...original, ingredient_name: toName };

        if (original.unit === 'pcs' && unitConversionTable[toName]) {
          converted.amount = original.amount * unitConversionTable[toName];
          converted.unit = 'g';
          converted.comment = `Auto-converted using ${unitConversionTable[toName]}g per piece`;
        } else if (original.unit !== 'g' && original.unit !== unitConversionTable[toName]) {
          converted.comment = `No known conversion from "${original.unit}" to "g"`;
        }

        updates.push({ original, converted });
      }
    });

    const status = updates.length > 0 ? 'ready' : 'already-merged';

    if (updates.length > 0) {
      affectedRecipes.push({
        title,
        recipeId,
        updates,
        status: 'ready'
      });
    }
    
  });

  res.render('ingredientMergePreview.ejs', {
    loggedInStatus,
    fromName,
    toName,
    affectedRecipes,
    crsfToken: req.csrfToken()
  });
});


router.post('/confirmMergeRecipe', redirectLogin, async (req, res) => {
  const { recipeId, from, to } = req.body;
  const loggedInStatus = getLoggedInUser(req);
  try {
    const docRef = db.collection('recipes').doc(recipeId);
    const recipeDoc = await docRef.get();
    const recipe = recipeDoc.data();
    const updatedIngredients = [];  // ingredients to update
    const unitConversionTable = {
      'kg' : 1000
    };
    // loop through ingredients for the passed recipe
    // if null set to []
    for (const ing of recipe.ingredients || []) {
      // is this ingredient the one we are changing   
      if (ing.ingredient_name === from) {
        // copy everything from cuurent ingredient
        // but overwrite the ingredient-name with the 
        // name of the ingredient passed
        const newIng = { ...ing, ingredient_name: to };
        // check for any conversions to grams
        if (ing.unit === 'pcs' && unitConversionTable[to]) {
          newIng.amount = ing.amount * unitConversionTable[to];
          newIng.unit = 'g';
        }
        updatedIngredients.push(newIng);  // put new ingredient in
        } else {
        updatedIngredients.push(ing);     // keep old ingredient
      }
    }
    // replace the ingredient array of objects in the recipe
    await docRef.update({ ingredients: updatedIngredients });
    res.redirect(`/ingredients/mergePreview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to merge recipe');
  }
});


router.get('/cleanupUnused', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  // get all ingredients
  const ingredientsSnapshot = await db.collection('Ingredients').get();
  const allIngredients = ingredientsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // get all used ingredient names in recipes
  const recipesSnapshot = await db.collection('recipes').get();
  const usedIngredients = new Set();

  recipesSnapshot.forEach(doc => {
    const recipe = doc.data();
    (recipe.ingredients || []).forEach(ing => {
      if (ing.ingredient_name) {
        usedIngredients.add(ing.ingredient_name.trim());
      }
    });
  });

  // find unused ingredients
  const unusedIngredients = allIngredients.filter(ing => !usedIngredients.has(ing.name.trim()));

  res.render('ingredientCleanup.ejs', {
    loggedInStatus,
    unusedIngredients,
    crsfToken: req.csrfToken()
  });
});

router.post('/deleteIngredient', redirectLogin, async (req, res) => {
  const { ingredientName } = req.body;

  try {
    await db.collection('Ingredients').doc(ingredientName).delete();
    res.send(`<p>Ingredient "${ingredientName}" deleted`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to delete ingredient');
  }
});


module.exports = router;

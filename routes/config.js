const express = require('express');
const router = express.Router();
const db = require('../firebaseAdmin');
const { redirectLogin } = require('../helpers/redirectLogin');
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const admin = require('firebase-admin');

// GET config edit form
router.get('/edit', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  try {
    const doc = await db.collection('Config').doc('flutterapp').get();
    const config = doc.exists ? doc.data() : {};
    res.render('configEdit', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      config,
      messages: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving configuration settings');
  }
});

router.post('/edit', redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  try {
    const configUpdate = {
      appstores: {
        android: req.body.android || '',
        ios: req.body.ios || ''
      },
      version: req.body.version || '',
      perishable_types: req.body.perishable_types
        ? req.body.perishable_types.split(',').map(t => t.trim())
        : []
    };

    configUpdate.feature_groups = Array.isArray(req.body.feature_groups)
    ? req.body.feature_groups.map(group => ({
        ...group,
        taglines: (group.taglines || []).filter(t => t.trim() !== '')
        }))
    : [];


    // Parse unlock codes
    const unlockCodesInput = req.body.unlockCodes || [];
    const unlockCodes = Object.values(unlockCodesInput)
      .map(entry => {
        const code = entry.code?.trim();
        const expiryDateRaw = entry.expiryDate ? new Date(entry.expiryDate) : null;

        return {
          code,
          expiryDate: expiryDateRaw instanceof Date && !isNaN(expiryDateRaw)
            ? admin.firestore.Timestamp.fromDate(expiryDateRaw)
            : null
        };
      })
      .filter(entry => entry.code && entry.expiryDate);

    configUpdate.unlockCodes = unlockCodes;

    await db.collection('Config').doc('flutterapp').set(configUpdate, { merge: true });

    res.render('configEdit', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      config: configUpdate,
      messages: [{ field: 'success', message: 'Configuration updated successfully' }]
    });
  } catch (err) {
    console.error(err);
    res.render('configEdit', {
      loggedInStatus,
      crsfToken: req.csrfToken(),
      config: {},
      messages: [{ field: 'error', message: 'Failed to update configuration: ' + err.message }]
    });
  }
});


module.exports = router;

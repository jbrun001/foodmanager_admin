const express = require("express");
const router = express.Router();
const db = require("../firebaseAdmin");
const { getLoggedInUser } = require("../helpers/getLoggedInUser");
const { redirectLogin } = require("../helpers/redirectLogin");
const { scrapePackSize } = require("../helpers/scrapePackSize");

let lastScrapeTime = 0; // create a timer so we don't accidentally test too fast

// function to format a date for display DD MMM YYYY HH:SS
function formatDate(isoString) {
  const date = new Date(isoString);
  const options = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  return date.toLocaleString("en-GB", options).replace(",", "");
}

// overview of all ingredients and current MOQ data
router.get("/overview", redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  try {
    // get all ingredients
    const snapshot = await db.collection("Ingredients").get();
    const ingredients = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const moqs = data.Moqs || [];

      moqs.forEach((moq, index) => {
        ingredients.push({
          ingredientId: doc.id,
          ingredientName: data.name,
          moqIndex: index,
          lastCollected: moq.lastCollected || "N/A",
          amount: moq.amount,
          units: moq.units,
          URL: moq.URL || "",
          store: moq.storeName || "",
        });
      });
    });

    res.render("scrapeOverview.ejs", {
      ingredients,
      loggedInStatus,
      crsfToken: req.csrfToken(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load scrape overview.");
  }
});

// test scrape an individual ingredient product page
router.get("/test/:ingredientId/:moqIndex", redirectLogin, async (req, res) => {
  const { ingredientId, moqIndex } = req.params;
  const loggedInStatus = getLoggedInUser(req);
  const now = Date.now();
  // 20 second delay
  if (now - lastScrapeTime < 6000) {
    return res.status(429).send("Please wait a few seconds between tests.");
  }
  lastScrapeTime = now;

  try {
    const doc = await db.collection("Ingredients").doc(ingredientId).get();
    if (!doc.exists) throw new Error("Ingredient not found");

    const data = doc.data();
    const moq = data.Moqs?.[parseInt(moqIndex)];
    if (!moq || !moq.URL) throw new Error("No URL found for this MOQ");

    const scrapeResult = await scrapePackSize(moq.URL);

    res.render("scrapeResult.ejs", {
      ingredientId,
      moqIndex,
      ingredientName: data.name,
      moq,
      scrapeResult,
      loggedInStatus,
      crsfToken: req.csrfToken(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send(`Scrape failed: ${err.message}`);
  }
});

// list and manage recent batches
// create a batch - ingredient selection
// tesitng - link to /overview for testing the scraper without updating anything
router.get("/createBatch", redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  const store = req.query.store || "Tesco"; // default to tesco
  const weeks = parseInt(req.query.weeks, 10) || 4; // default 4 weeks ago
  const xWeeksAgo = new Date();
  xWeeksAgo.setDate(xWeeksAgo.getDate() - 7 * weeks);

  // get the stores from firebase \Stores
  const storeSnapshot = await db.collection("Store").get();
  const allStores = [];

  storeSnapshot.forEach((doc) => {
    const storeData = doc.data();
    allStores.push(storeData.name);
  });

  // get all the ingredients
  const snapshot = await db.collection("Ingredients").get();
  const candidates = [];

  // filter ingredients
  snapshot.forEach((doc) => {
    const data = doc.data();
    const moqs = data.Moqs || [];
    let matchingMoq = null;
    for (let i = 0; i < moqs.length; i++) {
      const moq = moqs[i];
      // does this MoQ match the selected store
      const isForSelectedStore = moq.storeName === store;
      // does it have a valid lastCollected date?
      const hasLastCollected = !!moq.lastCollected;
      // is it recent enough?
      let isRecent = false;
      if (hasLastCollected) {
        const collectedDate = new Date(moq.lastCollected);
        isRecent = collectedDate >= xWeeksAgo;
      }
      // all conditions met?
      if (isForSelectedStore && hasLastCollected && isRecent) {
        matchingMoq = moq;
        break; // we found one, no need to check further
      }
    }

    let isMissingMoq = true;
    // check if we have dont have a moq for the current store
    for (let moq of moqs) {
      if (moq.storeName === store) {
        isMissingMoq = false; // found one — not missing
        break;
      }
    }
    const isOldMoq = !matchingMoq;
    // create the list to display containing missing moqs and
    // ones that are old and the right store
    if (isMissingMoq || isOldMoq) {
      const storeMoqs = [];
      // check for the right store
      for (const moq of moqs) {
        if (moq.storeName === store) {
          storeMoqs.push(moq);
        }
      }

      candidates.push({
        id: doc.id,
        name: data.name,
        moqs: storeMoqs, // only moqs for the selected store
      });
    }
  });

  const existingBatches = [];
  // get list of last 5 scrape batches
  const batchSnapshot = await db
    .collection("ScrapeBatches")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();
  for (const doc of batchSnapshot.docs) {
    const data = doc.data();
    const ingredientIds = data.ingredients || [];

    const ingredientNames = [];

    // get the ingredient names - for each ingredient in the batch
    for (let i = 0; i < ingredientIds.length; i++) {
      const id = ingredientIds[i];
      try {
        const ingDoc = await db.collection("Ingredients").doc(id).get();
        if (ingDoc.exists) {
          const ingData = ingDoc.data();
          ingredientNames.push(ingData.name || id); // use id if name is missing
        } else {
          ingredientNames.push(`${id} (not found)`);
        }
      } catch (err) {
        ingredientNames.push(`${id} (error)`);
      }
    }

    const ingredientList = ingredientNames.join(",</br>");
    existingBatches.push({
      id: doc.id,
      createdAt: formatDate(data.createdAt),
      storeName: data.storeName,
      status: data.status,
      ingredientCount: ingredientIds.length,
      initiatedBy: data.initiatedBy || "unknown",
      ingredientList,
    });
  }

  res.render("batchCreate.ejs", {
    loggedInStatus,
    candidates,
    allStores,
    selectedStore: store,
    selectedWeeks: weeks,
    existingBatches,
    crsfToken: req.csrfToken(),
  });
});

// add a new batch - get createBatch posts here
router.post("/createBatch", redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);
  try {
    const store = req.body.store;
    let selectedIngredients = [];
    if (Array.isArray(req.body.ingredients)) {
      // more than 1 checkboxes selected — we already have an array
      selectedIngredients = req.body.ingredients;
    } else if (typeof req.body.ingredients === "string") {
      // only one checkbox selected — we just have a string so create it as an array
      selectedIngredients = [req.body.ingredients];
    } else {
      // nothing selected
      selectedIngredients = [];
    }

    // error if nothing selected
    if (selectedIngredients.length === 0) {
      return res.status(400).send("No ingredients selected.");
    }

    const createdBy = loggedInStatus;
    const batch = {
      createdAt: new Date().toISOString(),
      storeName: store,
      ingredients: selectedIngredients,
      status: "pending",
      initiatedBy: createdBy,
    };
    // add batch to firebase
    const ref = await db.collection("ScrapeBatches").add(batch);
    // redirect to create batch route (get) new batch will be displayed in top section
    res.redirect(`/scrapes/createBatch`);
  } catch (err) {
    console.error("Error creating batch:", err);
    res.status(500).send("Failed to create batch.");
  }
});

// delete a scrape batch - called from createBatches
router.post("/deleteBatch/:batchId", redirectLogin, async (req, res) => {
  try {
    const batchId = req.params.batchId;
    await db.collection("ScrapeBatches").doc(batchId).delete();
    res.redirect("/scrapes/createBatch");
  } catch (err) {
    console.error("Error deleting batch:", err);
    res.status(500).send("Failed to delete batch.");
  }
});

// runs a batch passed to it (from createBatches)
router.get("/runBatch/:batchId", redirectLogin, async (req, res) => {
  const batchId = req.params.batchId;

  try {
    // get the batch
    const batchDoc = await db.collection("ScrapeBatches").doc(batchId).get();
    // if the batch does not exist stop
    if (!batchDoc.exists) {
      return res.status(404).send("Batch not found.");
    }
    const batchData = batchDoc.data();
    const store = batchData.storeName;
    const ingredientIds = batchData.ingredients || [];
    // update the batch status to running
    await db.collection("ScrapeBatches").doc(batchId).update({
      status: "running",
    });
    // loop through each ingredient in the batch
    for (let i = 0; i < ingredientIds.length; i++) {
      const ingredientId = ingredientIds[i];
      try {
        // fetch the ingredient document
        const ingDoc = await db
          .collection("Ingredients")
          .doc(ingredientId)
          .get();
        if (!ingDoc.exists) {
          continue; // skip if not found
        }

        const ingData = ingDoc.data();
        const moqs = ingData.Moqs || [];
        // find the moq for the selected store
        let moqIndex = -1;
        let currentMoq = null;
        for (let j = 0; j < moqs.length; j++) {
          if (moqs[j].storeName === store) {
            moqIndex = j;
            currentMoq = moqs[j];
            break;
          }
        }

        const url = currentMoq?.URL || null;
        if (!url) {
          continue; // skip if no url
        }

        // check if matched
        console.log(`starting scrape of:` + ingData.name);
        const result = await scrapePackSize(url);
        console.log(`scrape ended for: ` + ingData.name);
        console.log(result.logs);

        // examine results
        const currentAmount = currentMoq?.amount || null;
        const currentUnits = currentMoq?.units || null;
        let matched = false;
        const scrapedAmount = parseFloat(result.packSize);
        const storedAmount = parseFloat(currentAmount);
        const scrapedUnit = (result.units || "").toLowerCase();
        const storedUnit = (currentUnits || "").toLowerCase();
        if (scrapedAmount === storedAmount && scrapedUnit === storedUnit) {
          matched = true;
        }

        // prepare the scrape result
        const scrapeResult = {
          batchId: batchId,
          ingredientId: ingredientId,
          ingredientName: ingData.name || "",
          storeName: store,
          moqIndex: moqIndex,
          url: url,
          scrapedAmount: result.packSize || null,
          scrapedUnits: result.units || null,
          scrapedAt: new Date().toISOString(),
          currentAmount: currentAmount,
          currentUnits: currentUnits,
          matched: matched,
          reviewed: false,
          actionTaken: "pending",
          status: result.blocked ? "blocked" : "success",
          title: result.title || "",
          scrapeLog: result.logs || [],
        };

        // save the result
        await db.collection("ScrapeResults").add(scrapeResult);
        // pause for between 5 and 8 seconds before trying next ingredient
        const delayMs = 5000 + Math.floor(Math.random() * 3000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (ingredientErr) {
        console.error("error scraping ingredient", ingredientId, ingredientErr);
      }
    }
    // update the batch status to complete after all ingredients processed
    await db.collection("ScrapeBatches").doc(batchId).update({
      status: "complete",
    });

    res.redirect("/scrapes/reviewScrapes");
  } catch (err) {
    console.error("failed to run batch", err);
    res.status(500).send("failed to run batch");
  }
});

// list scrape results and users can decide what actions to take update/ignore
router.get("/reviewScrapes", redirectLogin, async (req, res) => {
  const loggedInStatus = getLoggedInUser(req);

  // get query parameters from dropdowns in page
  const selectedWeeks = parseInt(req.query.weeks, 10) || 1; // default to one week
  const selectedMatch = req.query.match || "all";
  const selectedReview = req.query.review || "pending";

  // calculate cutoff date for filtering
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedWeeks * 7);

  // get the results - get all - to save on reads - but could be a lot of data
  const snapshot = await db.collection("ScrapeResults").get();
  const results = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const scrapedDate = new Date(data.scrapedAt);
    // skip if scrape is too old
    if (scrapedDate < cutoff) {
      return;
    }
    // skip based on match status
    if (selectedMatch === "non-matching" && data.matched === true) {
      return;
    }
    if (selectedMatch === "matching" && data.matched === false) {
      return;
    }
    // skip based on review status
    if (selectedReview === "pending" && data.actionTaken !== "pending") {
      return;
    }
    if (selectedReview === "reviewed" && data.actionTaken === "pending") {
      return;
    }
    results.push({
      id: doc.id,
      ingredientId: data.ingredientId,
      ingredientName: data.ingredientName,
      storeName: data.storeName,
      currentAmount: data.currentAmount,
      currentUnits: data.currentUnits,
      scrapedAmount: data.scrapedAmount,
      scrapedUnits: data.scrapedUnits,
      title: data.title,
      matched: data.matched,
      actionTaken: data.actionTaken,
      reviewed: data.reviewed,
      scrapeDate: data.scrapedAt,
      status: data.status,
      scrapeLog: data.scrapeLog || [], // add log for viewing results of scrape
    });
  });

  res.render("reviewScrapes.ejs", {
    results,
    selectedWeeks,
    selectedMatch,
    selectedReview,
    crsfToken: req.csrfToken(),
    loggedInStatus,
  });
});

// ignore MoQ result
router.post("/ignoreResult/:resultId", redirectLogin, async (req, res) => {
  const resultId = req.params.resultId;

  try {
    await db.collection("ScrapeResults").doc(resultId).update({
      reviewed: true,
      actionTaken: "ignored",
    });

    res.redirect("/scrapes/reviewScrapes");
  } catch (err) {
    console.error("failed to mark result as ignored:", err);
    res.status(500).send("failed to mark result as ignored");
  }
});

// update MoQ with result
router.post("/updateFromResult/:resultId", redirectLogin, async (req, res) => {
  const resultId = req.params.resultId;

  try {
    // get the result document
    const resultDoc = await db.collection("ScrapeResults").doc(resultId).get();
    if (!resultDoc.exists) {
      return res.status(404).send("Scrape result not found");
    }

    const result = resultDoc.data();
    const ingredientId = result.ingredientId;
    const moqIndex = result.moqIndex;

    // load the ingredient document
    const ingDocRef = db.collection("Ingredients").doc(ingredientId);
    const ingDoc = await ingDocRef.get();
    if (!ingDoc.exists) {
      return res.status(404).send("Ingredient not found");
    }

    const ingData = ingDoc.data();
    const moqs = ingData.Moqs || [];

    // validate moq index
    if (moqIndex < 0 || moqIndex >= moqs.length) {
      return res.status(400).send("Invalid MoQ index");
    }

    // apply scraped values
    moqs[moqIndex].amount = result.scrapedAmount;
    moqs[moqIndex].units = result.scrapedUnits;
    moqs[moqIndex].lastCollected = new Date().toISOString();

    // update the ingredient
    await ingDocRef.update({ Moqs: moqs });

    // mark the result as updated
    await db.collection("ScrapeResults").doc(resultId).update({
      reviewed: true,
      actionTaken: "updated",
    });

    res.redirect("/scrapes/reviewScrapes");
  } catch (err) {
    console.error("failed to apply update from scrape result:", err);
    res.status(500).send("failed to apply update");
  }
});

module.exports = router;

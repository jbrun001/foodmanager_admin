const express = require("express");
const router = express.Router();
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL');
const { redirectLogin } = require('../helpers/redirectLogin');
const db = require('../firebaseAdmin'); 

router.get('/weeklySummary', redirectLogin, async (req, res, next) => {
    const loggedInStatus = getLoggedInUser(req);

    try {
        // get all user documents
        const usersSnap = await db.collection('Users').get();
        // placeholder for the report output
        const reportRows = [];
  
        // for every user
        for (const userDoc of usersSnap.docs) {
            const userId = userDoc.id;
            const userEmail = userDoc.data().email || 'Unknown';
    
            // get smartlists
            const smartListsSnap = await db.collection(`Users/${userId}/SmartLists`).get();
            const foodByWeek = {};  // results holder - format '2025-04-20': 320 
            // for evert smartlist for this user
            for (const smartDoc of smartListsSnap.docs) {
                const dateStr = smartDoc.id;
                const items = smartDoc.data().items || [];
            
                const date = new Date(dateStr);
                if (isNaN(date)) {
                    console.warn(`Skipping SmartList for user ${userId} — invalid date format in doc ID: ${dateStr}`);
                    continue;
                }
            
                const sunday = new Date(date);
                sunday.setDate(date.getDate() - date.getDay());
                const weekStr = sunday.toISOString().split('T')[0];
            
                let weeklyTotal = 0;
                items.forEach(item => {
                    // fix any bad numbers
                    const amt = parseFloat(item.purchase_amount);
                    if (!isNaN(amt)) {
                        weeklyTotal += amt;
                    }
                });
         
                if (!foodByWeek[weekStr]) foodByWeek[weekStr] = 0;
                foodByWeek[weekStr] += weeklyTotal;
            }          

            // process wastelogs
            const wasteLogsSnap = await db.collection(`Users/${userId}/WasteLogs`).get();
            const wasteByWeek = {}; // week: { total, composted, inedible }
            
            for (const doc of wasteLogsSnap.docs) {
                const { week, amount, inedibleParts, composted } = doc.data();
// testing - show data being processed
                console.dir(doc.data(), { depth: null });
                let weekStr;
                try {
                    weekStr = week.toDate().toISOString().split('T')[0];
                } catch (err) {
                    console.warn(`Skipping WasteLog with invalid 'week' for user ${userId}:`, err.message);
                    continue;
                }
                if (!wasteByWeek[weekStr]) {
                    wasteByWeek[weekStr] = {
                        total: 0,
                        composted: 0,
                        inedible: 0
                    };
                }

                const amt = parseFloat(amount);
                const comp = parseFloat(composted);
                const ined = parseFloat(inedibleParts);
                if (!isNaN(amt)) wasteByWeek[weekStr].total += amt;
                if (!isNaN(comp)) wasteByWeek[weekStr].composted += comp;
                if (!isNaN(ined)) wasteByWeek[weekStr].inedible += ined;
            }
            
            // now get planned portions by week and person from mealplan
            const mealPlansSnap = await db.collection(`Users/${userId}/MealPlans`).get();
            const portionsByWeek = {}; // week string : total portions
            
            for (const doc of mealPlansSnap.docs) {
                const mealDateRaw = doc.id.split('T')[0]; // get only the date part
                const date = new Date(mealDateRaw);
            
                if (isNaN(date)) {
                    console.warn(`Invalid MealPlan date for ${userId}: ${doc.id}`);
                    continue;
                }
            
                const sunday = new Date(date);
                sunday.setDate(sunday.getDate() - sunday.getDay()); // Get Sunday
                const weekStr = sunday.toISOString().split('T')[0];
            
                const portions = parseInt(doc.data().plannedPortions);
                if (!isNaN(portions)) {
                    if (!portionsByWeek[weekStr]) portionsByWeek[weekStr] = 0;
                    portionsByWeek[weekStr] += portions;
            
                    console.log(`  ${weekStr} has ${portions} plannedPortions`);
                }
            }
            
            // merge data sets together before pushing
            // had to do this because otherwise only records where week matched 
            // would be pushed
            const mergedWeeks = {};
            Object.keys(foodByWeek).forEach(week => {
                mergedWeeks[week] = true;
            });
            Object.keys(wasteByWeek).forEach(week => {
                mergedWeeks[week] = true;
            });
            Object.keys(portionsByWeek).forEach(week => {
                mergedWeeks[week] = true;
            });            

            // push rows to object for ejs.
            for (const week in mergedWeeks) {
                // get the data for reporting, if a week has no data then output 0's for all fields
                const waste = wasteByWeek[week] || { total: 0, composted: 0, inedible: 0 };
                const portions = portionsByWeek[week] || 0;
                reportRows.push({
                    email: userEmail,
                    week,
                    food_bought_g: foodByWeek[week],
                    total_waste_g: waste.total,
                    total_composted_g: waste.composted,
                    total_inedible_g: waste.inedible,
                    plannedPortions: portions
                });
            }
        }
        res.render("weeklySummary.ejs", {
            loggedInStatus,
            data: reportRows,
            crsfToken: req.csrfToken()
        });
  
    } catch (err) {
        console.error("Error generating report:", err);
        next(err);
    }
});
  

module.exports = router;

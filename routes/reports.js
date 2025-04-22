const express = require("express");
const router = express.Router();
const { getLoggedInUser } = require('../helpers/getLoggedInUser');
const { ORIGIN_URL } = require('../helpers/getOriginURL');
const { redirectLogin } = require('../helpers/redirectLogin');
const db = require('../firebaseAdmin'); 



// make report element a function so can be used to output csv or display
async function generateWeeklySummaryData() {
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
                // weekStr = week.toDate().toISOString().split('T')[0];
                // fix becuase above line was setting to the day before when it was converted
                // because it took an hour off becaues timezone - getting date this way
                // stops any changes to the day
                const localDate = week.toDate();
                weekStr = localDate.getFullYear() + '-' +
                          String(localDate.getMonth() + 1).padStart(2, '0') + '-' +
                          String(localDate.getDate()).padStart(2, '0');
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
        
        // creating a list of all possinble
        // weekdates in the 3 results
        // this is so when we loop through this below
        // we examine every date that has data in any of the results
        const mergedWeeks = {};
        const foodWeeks = Object.keys(foodByWeek);
        for (let i = 0; i < foodWeeks.length; i++) {
            const week = foodWeeks[i];
            if (!(week in mergedWeeks)) {
                mergedWeeks[week] = true;  // if not there create an entry with value true
            }
        }
        const wasteWeeks = Object.keys(wasteByWeek);
        for (let i = 0; i < wasteWeeks.length; i++) {
            const week = wasteWeeks[i];
            if (!(week in mergedWeeks)) {
                mergedWeeks[week] = true;
            }
        }
        const portionsWeeks = Object.keys(portionsByWeek);
        for (let i = 0; i < portionsWeeks.length; i++) {
            const week = portionsWeeks[i];
            if (!(week in mergedWeeks)) {
                mergedWeeks[week] = true;
            }
        }
console.log('Food weeks:', Object.keys(foodByWeek));
console.log('Waste weeks:', Object.keys(wasteByWeek));
console.log('Portions weeks:', Object.keys(portionsByWeek));
        // push rows to object for ejs, loop through all possible dates
        for (const week in mergedWeeks) {
console.log(`PUSHING ROW: ${userEmail} | week: ${week}`);
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
    return reportRows;
}

router.get('/weeklySummary', redirectLogin, async (req, res, next) => {
    const loggedInStatus = getLoggedInUser(req);
    try {
        const reportRows = await generateWeeklySummaryData();
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

router.get('/weeklySummary/csv', redirectLogin, async (req, res, next) => {
    try {
        const rows = await generateWeeklySummaryData();
        // rename headers to match what juptr is expecting 
        const headers = [
            'id',
            'week',
            'food_bought_g',
            'total_waste_g',
            'composted_g',
            'inedible_g',
            'portions'
        ];

        // create header row comma separated
        let csvContent = headers.join(',') + '\n';

        rows.forEach(row => {
            csvContent += [
                row.email,
                row.week,
                row.food_bought_g,
                row.total_waste_g,
                row.total_composted_g,
                row.total_inedible_g,
                row.plannedPortions
            ].join(',') + '\n';
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('weeklySummary.csv');
        res.send(csvContent);
    } catch (err) {
        console.error("Failed to generate CSV:", err);
        next(err);
    }
});


module.exports = router;

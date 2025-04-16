require("dotenv").config();  
let ORIGIN_URL = 'http://localhost:8000';  
//note: PRODUCTION_URL=https://doc.gold.ac.uk/usr/199 is the correct entry for the uni production server 
if (process.env.LIVE_SYSTEM.toLowerCase() == "true") {
  ORIGIN_URL = process.env.PRODUCTION_URL.toLowerCase();
}
module.exports = { ORIGIN_URL }; 
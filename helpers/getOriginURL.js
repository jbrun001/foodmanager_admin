require("dotenv").config();  
/// this code requird when not running at root - for cloud deploy we are running at root 
// so origin url can be blank.
//let ORIGIN_URL = 'http://localhost:8000';  
//note: is the correct entry for the uni production server 
//if (process.env.LIVE_SYSTEM.toLowerCase() == "true") {
//  ORIGIN_URL = process.env.PRODUCTION_URL.toLowerCase();
//}
let ORIGIN_URL = '';
module.exports = { ORIGIN_URL }; 
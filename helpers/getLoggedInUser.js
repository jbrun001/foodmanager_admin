function getLoggedInUser(req) {
    if (req.session && req.session.userEmail) return req.session.userEmail;
    else return "not logged in";
  }
  
module.exports = {
    getLoggedInUser,
};
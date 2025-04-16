const { ORIGIN_URL } = require('../helpers/getOriginURL')

const redirectLogin = (req, res, next) => {
    if (!req.session.userId ) {       
        res.redirect(ORIGIN_URL+'/users/login') // redirect to the login page
    } else { 
        next (); // move to the next middleware function
    } 
}

module.exports = {
    redirectLogin,
};
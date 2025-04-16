// sanitise all fields passed in req.body or req.query
// calling this sanitises all fields in req.body or req.query 
// it sanitises in place, so the fields can then be used safely
// this requires the express-sanitizer to have been imported 
// and applied to the req. routes
// this happens in index.js so it doesn't need to be repeated here
// this is called by validateAndSanitiseInputs
const sanitiseInputs = (req, res, next) => {
    // if there is a req.body because it's a post and the 
    // data's in the body
    if (req.body) {
        // for each field that is in req.body
        Object.keys(req.body).forEach((key) => {
            // don't sanitise password  because it could change what the user input
            // sql injection for password field is managed in validateAndSanitiseInput
            // so sql injection chars not allowed in the password field
            // and don't sanitise the _crsf token
            if (key !== 'password' && (key !=='_csrf')) { 
                // sanitise it and replace it with the sanitised version
                req.body[key] = req.sanitize(req.body[key]);
            }
        });
    }

    // if there is a req.query because the data is in the url
    if (req.query) {
        // for each field that is in req.query
        Object.keys(req.query).forEach((key) => {
            // sanitise it and replace it with the sanitised version
            req.query[key] = req.sanitize(req.query[key]);
        });
    }

    // if there is a req.params because the data is in the path (used in the API)
    if (req.params) {
        // for each field that is in req.query
        Object.keys(req.params).forEach((key) => {
            // sanitise it and replace it with the sanitised version
            req.params[key] = req.sanitize(req.params[key]);
        });
    }

    next();
};

module.exports = sanitiseInputs;

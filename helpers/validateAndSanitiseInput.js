// validateAndSanitiseInput 
//  one middleware funtion that keeps all the validation
//  logic in one place
//  - validates fields for specific routes
//  - validation rules for each field specified here
//  - creates req.validationErrors array containing field and 
//    frieldly error message for each validation error
//  - replaces all field values with sanitised versions of the values
//  - validates the fields specified
//  - using .optional in the validation means that if the field is not 
//    present then the validation is skipped, so the same function can
//    be used in all routes, regardless of what inputs there are
//  - if after calling req.validationErrors doesn't exist then there 
//    are no validation errors
const { param,query,body, validationResult } = require('express-validator');
const sanitiseInputs = require('./sanitiseInputs'); 

// validation and sanitisation for all of the fund fields
const validateAndSanitiseFunds = [
    query('search_text')
        .optional()
        .isLength({ min: 3 }).withMessage('Search text must be greater than 3 characters')
        .isAlphanumeric('en-US', { ignore: ' ' }).withMessage('Search text must be alphanumeric')
        .trim(),
    query('sort_by')
        .optional()
        .isIn(['size', 'fee', 'dividend_yield']).withMessage('Incorrect sorting field')
        .trim(),
    param('search_text')
        .optional()
        .isLength({ min: 3 }).withMessage('Search text must be greater than 3 characters')
        .isAlphanumeric('en-US', { ignore: ' ' }).withMessage('Search text must be alphanumeric')
        .trim(),
    sanitiseInputs,
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];

const validateAndSanitisePortfolios = [
    body('name')
        .optional() // only validate if the field exists
        .isLength({ min: 3 }).withMessage('Portfolio name must be at least 3 characters long.')
        .trim(),
    sanitiseInputs,
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];

const validateAndSanitiseUsers = [
    body('email')
        .optional() // Only validate if the field exists
        .isEmail().withMessage('Please provide a valid email address')
        .trim(),
    body('password')
        .optional() 
        .isLength({ min: 9 }).withMessage('Password must be at least 9 characters long')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[\W_]/).withMessage('Password must contain at least one special character')
        // because we are not sanitising the plain password we have to make sure
        // that it doesn't contain any characters that could be used for
        // sql injection attacks
        .not()
        .matches(/['";\-#]/).withMessage('Password cannot contain \' \" ; -- or #' ),
    sanitiseInputs,
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];

const validateAndSanitiseTransactions = [
    body('fund_id')
        .optional() // only validate if the field exists
        .isInt().withMessage('fund id must be an integer')
        .trim(),
    body('portfolio_id')
        .optional() 
        .isInt().withMessage('portfolio id must be an integer')
        .trim(),
    body('volume')
        .optional() 
        .isFloat().withMessage('volume must be a float')
        .trim(),
    body('share_price')
        .optional() 
        .isFloat().withMessage('price must be a float')
        .trim(),
    body('transaction_date')
        .optional()
        .isISO8601().withMessage('the date must be valid')
        .trim(),
    body('transaction_id')
        .optional() 
        .isFloat().withMessage('price must be a float')
        .trim(),

    sanitiseInputs,
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];

const validateAndSanitisePrices = [
    query('ticker')
        .optional()
        .isLength({ min: 3 }).withMessage('ticker must be at least 3 characters')
        .isAlphanumeric('en-US', { ignore: '.' }).withMessage('ticker must be alphanumeric but can include .')
        .trim(),
    sanitiseInputs,
    (req, res, next) => {
        // validate and build an array of fields that failed validation and why they failed
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.validationErrors = [];
            errors.array().forEach(function(error) {
                req.validationErrors.push({
                    field: error.path,      // the field that failed validation
                    message: error.msg,     // the validation message
                });
            });
        } else {
            req.validationErrors = null; // if there are no errors
        }
        next();
    },
];


module.exports = {
  validateAndSanitiseFunds,
  validateAndSanitisePortfolios,
  validateAndSanitiseUsers,
  validateAndSanitiseTransactions,
  validateAndSanitisePrices
};

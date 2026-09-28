const { body, query } = require('express-validator');

const BUDGET_CATEGORIES = [
  'ROAD_REPAIR', 'SANITATION', 'STREET_LIGHTS', 'DRAINAGE', 'WATER_SUPPLY', 'OTHER',
];


const createBudgetValidation = [
  body('ucId')
    .trim()
    .notEmpty().withMessage('UC ID is required'),
  body('allocatedAmount')
    .isFloat({ min: 0 }).withMessage('allocatedAmount must be a non-negative number'),
  body('spentAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('spentAmount must be a non-negative number'),
  body('workOrderId')
    .optional()
    .isMongoId().withMessage('workOrderId must be a valid MongoDB ObjectId'),
  body('category')
    .trim()
    .notEmpty().withMessage('Budget category is required')
    .isIn(BUDGET_CATEGORIES)
    .withMessage(`Invalid category. Allowed: ${BUDGET_CATEGORIES.join(', ')}`),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
];

const getBudgetsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('ucId')
    .optional()
    .trim()
    .notEmpty().withMessage('ucId filter cannot be empty'),
  query('category')
    .optional()
    .isIn(BUDGET_CATEGORIES)
    .withMessage(`Invalid category filter. Allowed: ${BUDGET_CATEGORIES.join(', ')}`),
];

module.exports = { createBudgetValidation, getBudgetsValidation };

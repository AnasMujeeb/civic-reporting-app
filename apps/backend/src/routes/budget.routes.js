const express = require('express');
const router  = express.Router();
const {
  createBudget,
  getAllBudgets,
  getBudgetSummary,
  allocateBudget,
} = require('../controllers/budget.controller');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { createBudgetValidation, getBudgetsValidation } = require('../validators/budget.validator');
const validate = require('../middlewares/validate.middleware');

// All budget routes require authentication
router.use(protect);

// GET /api/v1/budget/summary — aggregate view for Mayor dashboard (must be before /:id)
router.get(
  '/summary',
  restrictTo('UC_OFFICER', 'MAYOR', 'OPS', 'ADMIN'),
  getBudgetSummary
);

// POST /api/v1/budget/allocate — Mayor dynamic budget allocation & editing
router.post(
  '/allocate',
  restrictTo('MAYOR', 'OPS', 'ADMIN'),
  allocateBudget
);


// GET  /api/v1/budget — list budget allocations (filtered + paginated)
router.get(
  '/',
  restrictTo('UC_OFFICER', 'MAYOR', 'OPS', 'ADMIN'),
  getBudgetsValidation,
  validate,
  getAllBudgets
);

// POST /api/v1/budget — create a new budget allocation
router.post(
  '/',
  restrictTo('MAYOR', 'OPS', 'ADMIN'),
  createBudgetValidation,
  validate,
  createBudget
);

module.exports = router;

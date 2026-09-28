const express = require('express');
const router = express.Router();
const { getMayorSummary } = require('../controllers/analytics.controller');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

// GET /api/v1/analytics/mayor-summary
router.get(
  '/mayor-summary',
  protect,
  restrictTo('MAYOR', 'OPS', 'ADMIN', 'UC_OFFICER'),
  getMayorSummary
);

module.exports = router;

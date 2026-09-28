const express = require('express');
const router = express.Router();
const { 
  createContractor, 
  getAllContractors, 
  updateContractorStatus 
} = require('../controllers/contractor.controller');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { createContractorValidation, updateContractorValidation } = require('../validators/contractor.validator');
const validate = require('../middlewares/validate.middleware');

router.route('/')
  .get(protect, getAllContractors)
  .post(protect, restrictTo('ADMIN'), createContractorValidation, validate, createContractor);

router.route('/:id')
  .patch(protect, restrictTo('UC_OFFICER', 'ADMIN', 'MAYOR', 'OPS'), updateContractorValidation, validate, updateContractorStatus);

router.route('/:id/blacklist')
  .patch(protect, restrictTo('UC_OFFICER', 'ADMIN', 'MAYOR', 'OPS'), updateContractorStatus);

module.exports = router;
const { body, param } = require('express-validator');

const createContractorValidation = [
  body('name').trim().notEmpty().withMessage('Contractor name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('category').trim().notEmpty().withMessage('Contractor category/specialization is required'),
];

const updateContractorValidation = [
  param('id').isMongoId().withMessage('Valid contractor ID is required'),
  body('isBlacklisted').optional().isBoolean().withMessage('isBlacklisted must be a boolean value'),
];

module.exports = { createContractorValidation, updateContractorValidation };
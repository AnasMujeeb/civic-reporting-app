const { body, param, query } = require('express-validator');

const createWorkOrderValidation = [
  body('reportId').isMongoId().withMessage('Valid report ID is required'),
  body('contractorId').isMongoId().withMessage('Valid contractor ID is required'),
  body('deadline').optional().isISO8601().toDate().withMessage('Deadline must be a valid date'),
  body('checklist').optional().isArray().withMessage('Checklist must be an array'),
  body('estimatedCost').optional().isFloat({ min: 0 }).withMessage('estimatedCost must be a non-negative number'),
];

const updateWorkOrderStatusValidation = [
  param('id').isMongoId().withMessage('Valid work order ID is required'),
  body('status')
    .isIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RE_VERIFIED'])
    .withMessage('Invalid status value'),
];

const reVerifyWorkOrderValidation = [
  param('id').isMongoId().withMessage('Valid work order ID is required'),
  body('inspectionNotes').optional().trim().isLength({ max: 1000 }).withMessage('Inspection notes max 1000 characters'),
  body('inspectionRating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be an integer from 1 to 5'),
];

const getAllWorkOrdersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('status').optional().isIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RE_VERIFIED'])
    .withMessage('Invalid status filter'),
  query('contractorId').optional().isMongoId().withMessage('contractorId must be a valid MongoId'),
];

module.exports = {
  createWorkOrderValidation,
  updateWorkOrderStatusValidation,
  reVerifyWorkOrderValidation,
  getAllWorkOrdersValidation,
};
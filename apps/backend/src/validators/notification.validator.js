const { body } = require('express-validator');

const broadcastValidation = [
  body('title').trim().notEmpty().withMessage('Notification title is required'),
  body('body').trim().notEmpty().withMessage('Notification body is required'),
  body('recipientIds')
    .optional()
    .isArray()
    .withMessage('recipientIds must be an array'),
  body('recipientIds.*')
    .optional()
    .isMongoId()
    .withMessage('Each recipientId must be a valid MongoDB ObjectId'),
];

module.exports = { broadcastValidation };

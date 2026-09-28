const { body } = require('express-validator');

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['CITIZEN', 'STREET_REP', 'CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'ADMIN', 'OPS'])
    .withMessage('Invalid role selected'),
  body('officialCode').optional().trim(),
  body('ucNumber').optional().trim(),
  body('zone').optional().trim(),
];

const loginValidation = [
  body('phone').optional().trim(),
  body('email').optional().trim().isEmail().withMessage('Invalid email format'),
  body('password').notEmpty().withMessage('Password is required'),
  // Custom validator: at least one of phone or email must be provided
  body().custom((value, { req }) => {
    const phone = req.body.phone && String(req.body.phone).trim();
    const email = req.body.email && String(req.body.email).trim();
    if (!phone && !email) {
      throw new Error('Phone number or email is required');
    }
    return true;
  }),
];

module.exports = { registerValidation, loginValidation };
const express = require('express');
const router  = express.Router();
const {
  getAllUsers,
  updateUserRole,
  assignUcZone,
} = require('../controllers/user.controller');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate.middleware');

// All user management routes require auth + ADMIN or MAYOR
router.use(protect);
router.use(restrictTo('ADMIN', 'MAYOR'));

// ── GET /api/v1/users ─────────────────────────────────────────────────────────
const getUsersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('role').optional().isIn(['CITIZEN', 'STREET_REP', 'CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'ADMIN'])
    .withMessage('Invalid role filter'),
  query('search').optional().trim(),
];
router.get('/', getUsersValidation, validate, getAllUsers);

// ── PATCH /api/v1/users/:id/role ──────────────────────────────────────────────
const updateRoleValidation = [
  param('id').isMongoId().withMessage('Valid user ID is required'),
  body('role')
    .isIn(['CITIZEN', 'STREET_REP', 'CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'ADMIN'])
    .withMessage('Invalid role value'),
];
router.patch('/:id/role', updateRoleValidation, validate, updateUserRole);

// ── PATCH /api/v1/users/:id/assign-uc ─────────────────────────────────────────
const assignUcValidation = [
  param('id').isMongoId().withMessage('Valid user ID is required'),
  body('ucNumber').optional().trim().notEmpty().withMessage('ucNumber cannot be empty'),
  body('zone').optional().trim().notEmpty().withMessage('zone cannot be empty'),
];
router.patch('/:id/assign-uc', assignUcValidation, validate, assignUcZone);

module.exports = router;

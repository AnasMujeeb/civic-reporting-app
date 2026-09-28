const { body, param, query } = require('express-validator');

// ── Shared enum constants ─────────────────────────────────────────────────────
const REPORT_CATEGORIES = [
  'ROAD_REPAIR', 'SANITATION', 'STREET_LIGHTS', 'DRAINAGE', 'WATER_SUPPLY', 'OTHER',
];

const REPORT_STATUSES = [
  'PENDING', 'REP_VERIFIED', 'IN_PROGRESS', 'FIXED', 'CLOSED',
];

// ── Create Report ─────────────────────────────────────────────────────────────
const createReportValidation = [
  body('title').trim().notEmpty().withMessage('Report title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category')
    .trim()
    .notEmpty().withMessage('Category is required')
    .isIn(REPORT_CATEGORIES)
    .withMessage(`Invalid category. Allowed: ${REPORT_CATEGORIES.join(', ')}`),
  body('latitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90'),
  body('longitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180'),
];

// ── Update Report Status ──────────────────────────────────────────────────────
const updateReportStatusValidation = [
  param('id').isMongoId().withMessage('Valid report ID is required'),
  body('status')
    .isIn(REPORT_STATUSES)
    .withMessage(`Invalid status. Allowed: ${REPORT_STATUSES.join(', ')}`),
];

// ── Resolve Report ────────────────────────────────────────────────────────────
const resolveReportValidation = [
  param('id').isMongoId().withMessage('Valid report ID is required'),
];

// ── Add Comment ───────────────────────────────────────────────────────────────
const addCommentValidation = [
  param('id').isMongoId().withMessage('Valid report ID is required'),
  body('text').trim().notEmpty().withMessage('Comment text is required'),
];

// ── Upvote Report ─────────────────────────────────────────────────────────────
const upvoteReportValidation = [
  param('id').isMongoId().withMessage('Valid report ID is required'),
];

// ── Get Report By ID ──────────────────────────────────────────────────────────
const getReportByIdValidation = [
  param('id').isMongoId().withMessage('Valid report ID is required'),
];

// ── Get All Reports (pagination + filters) ────────────────────────────────────
const getAllReportsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be an integer between 1 and 100'),
  query('status')
    .optional()
    .custom((val) => {
      const statuses = String(val).split(',').map((s) => s.trim()).filter(Boolean);
      const allValid = statuses.every((s) => REPORT_STATUSES.includes(s));
      if (!allValid) {
        throw new Error(`Invalid status filter. Allowed: ${REPORT_STATUSES.join(', ')}`);
      }
      return true;
    }),
  query('category')
    .optional()
    .isIn(REPORT_CATEGORIES)
    .withMessage(`Invalid category filter. Allowed: ${REPORT_CATEGORIES.join(', ')}`),
  query('startDate')
    .optional()
    .isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
];

module.exports = {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  createReportValidation,
  updateReportStatusValidation,
  resolveReportValidation,
  addCommentValidation,
  upvoteReportValidation,
  getReportByIdValidation,
  getAllReportsValidation,
};
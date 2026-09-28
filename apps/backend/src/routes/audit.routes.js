const express = require('express');
const router  = express.Router();
const AuditLog = require('../models/AuditLog');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { query, param } = require('express-validator');
const validate = require('../middlewares/validate.middleware');

// All audit log routes require authentication + admin/mayor role
router.use(protect);
router.use(restrictTo('ADMIN', 'MAYOR'));

// ── Validation chain for query params ─────────────────────────────────────────
const getAuditLogsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('action').optional().trim().notEmpty().withMessage('action filter cannot be empty'),
  query('targetModel').optional().isIn(['User', 'Report', 'WorkOrder', 'Contractor', 'Budget', 'Notification'])
    .withMessage('Invalid targetModel filter'),
  query('actor').optional().isMongoId().withMessage('actor must be a valid MongoId'),
];

// ── GET /api/v1/audit-logs ────────────────────────────────────────────────────
router.get('/', getAuditLogsValidation, validate, async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.action)      filter.action      = req.query.action;
    if (req.query.targetModel) filter.targetModel = req.query.targetModel;
    if (req.query.actor)       filter.actor       = req.query.actor;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name phone role')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

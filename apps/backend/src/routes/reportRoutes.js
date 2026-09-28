const express = require('express');
const { 
  createReport, 
  getAllReports, 
  getNearbyReports, 
  getMyReports,
  getReportStats,
  getReportById,
  addComment,
  updateReportStatus,
  upvoteReport,
  resolveReport,
  escalateReport,
  closeReport
} = require('../controllers/reportController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const {
  createReportValidation,
  updateReportStatusValidation,
  resolveReportValidation,
  addCommentValidation,
  upvoteReportValidation,
  getReportByIdValidation,
  getAllReportsValidation,
} = require('../validators/report.validator');
const validate = require('../middlewares/validate.middleware');

const router = express.Router();

router.get('/nearby', protect, getNearbyReports);
router.get('/my-reports', protect, getMyReports);
router.get(
  '/stats', 
  protect, 
  restrictTo('STREET_REP', 'UC_OFFICER', 'ADMIN'), 
  getReportStats
);

router.route('/')
  .post(protect, upload.single('image'), createReportValidation, validate, createReport)
  .get(protect, getAllReportsValidation, validate, getAllReports);

router.get('/:id', protect, getReportByIdValidation, validate, getReportById);
router.post('/:id/comments', protect, addCommentValidation, validate, addComment);
router.post('/:id/upvote', protect, upvoteReportValidation, validate, upvoteReport);

router.patch(
  '/:id/status', 
  protect, 
  restrictTo('STREET_REP', 'CONTRACTOR', 'UC_OFFICER', 'ADMIN'),
  updateReportStatusValidation,
  validate,
  updateReportStatus
);

router.route('/:id/resolve')
  .post(
    protect,
    restrictTo('UC_OFFICER', 'ADMIN', 'CONTRACTOR', 'STREET_REP'),
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'beforeImage', maxCount: 1 },
      { name: 'afterImage', maxCount: 1 }
    ]),
    resolveReportValidation,
    validate,
    resolveReport
  )
  .patch(
    protect,
    restrictTo('UC_OFFICER', 'ADMIN', 'CONTRACTOR', 'STREET_REP'),
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'beforeImage', maxCount: 1 },
      { name: 'afterImage', maxCount: 1 }
    ]),
    resolveReportValidation,
    validate,
    resolveReport
  );

// ── POST /api/v1/reports/:id/escalate — Mayor / OPS Quick Action Override ─────
router.post(
  '/:id/escalate',
  protect,
  restrictTo('MAYOR', 'OPS', 'ADMIN', 'UC_OFFICER'),
  resolveReportValidation,
  validate,
  escalateReport
);

// ── PATCH /api/v1/reports/:id/close — Final Officer / Mayor Approval & Closure ──
router.patch(
  '/:id/close',
  protect,
  restrictTo('UC_OFFICER', 'ADMIN', 'MAYOR', 'OPS'),
  resolveReportValidation,
  validate,
  closeReport
);

module.exports = router;
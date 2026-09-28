const express = require('express');
const router  = express.Router();
const {
  createWorkOrder,
  updateWorkOrderStatus,
  reVerifyWorkOrder,
  rejectWorkOrder,
  getContractorWorkOrders,
  getWorkOrderById,
  getAllWorkOrders,
} = require('../controllers/workOrder.controller');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const {
  createWorkOrderValidation,
  updateWorkOrderStatusValidation,
  reVerifyWorkOrderValidation,
  getAllWorkOrdersValidation,
} = require('../validators/workOrder.validator');
const validate = require('../middlewares/validate.middleware');

// ── GET /api/v1/work-orders — Paginated work orders listing ──────────────────
router.get(
  '/',
  protect,
  restrictTo('UC_OFFICER', 'MAYOR', 'ADMIN', 'STREET_REP', 'CONTRACTOR'),
  getAllWorkOrdersValidation,
  validate,
  getAllWorkOrders
);

// ── GET /api/v1/work-orders/my-orders — Contractor specific alias ────────────
router.get(
  '/my-orders',
  protect,
  restrictTo('CONTRACTOR', 'UC_OFFICER', 'ADMIN'),
  getAllWorkOrders
);

// ── POST /api/v1/work-orders — UC Officer / Street Rep creates a work order ──
router.post(
  '/',
  protect,
  restrictTo('UC_OFFICER', 'MAYOR', 'STREET_REP', 'ADMIN'),
  createWorkOrderValidation,
  validate,
  createWorkOrder
);

// ── GET /api/v1/work-orders/contractor/:contractorId — all jobs for a contractor
router.get(
  '/contractor/:contractorId',
  protect,
  restrictTo('CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'ADMIN', 'STREET_REP'),
  getContractorWorkOrders
);

// ── GET /api/v1/work-orders/:id — single work order detail ──────────────────
router.get('/:id', protect, getWorkOrderById);

// ── PATCH /api/v1/work-orders/:id/status — contractor updates status + proof ─
router.patch(
  '/:id/status',
  protect,
  restrictTo('CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'STREET_REP', 'ADMIN'),
  upload.single('proofPhoto'),
  updateWorkOrderStatusValidation,
  validate,
  updateWorkOrderStatus
);

// ── POST /api/v1/work-orders/:id/re-verify — Street Rep / Officer re-inspection ─
router.post(
  '/:id/re-verify',
  protect,
  restrictTo('STREET_REP', 'UC_OFFICER', 'MAYOR', 'ADMIN'),
  reVerifyWorkOrderValidation,
  validate,
  reVerifyWorkOrder
);

// ── POST /api/v1/work-orders/:id/reject — Street Rep / Officer rejects work for rework ─
router.post(
  '/:id/reject',
  protect,
  restrictTo('STREET_REP', 'UC_OFFICER', 'MAYOR', 'ADMIN'),
  rejectWorkOrder
);

module.exports = router;
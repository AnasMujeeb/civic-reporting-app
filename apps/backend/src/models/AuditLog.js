const mongoose = require('mongoose');

/**
 * AuditLog Model — Immutable Audit Trail
 *
 * Records every state-changing administrative action in the system:
 * role promotions, report status changes, budget allocations,
 * contractor blacklisting, work order transitions, etc.
 *
 * These documents should NEVER be updated or deleted (append-only).
 */
const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // What action was performed (e.g. 'ROLE_PROMOTION', 'REPORT_STATUS_CHANGE')
    action: {
      type: String,
      required: true,
      index: true,
    },

    // Which model/collection was affected
    targetModel: {
      type: String,
      required: true,
      enum: ['User', 'Report', 'WorkOrder', 'Contractor', 'Budget', 'Notification'],
    },

    // The _id of the affected document
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Snapshot of before/after state for the changed fields
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after:  { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Request metadata
    ipAddress: {
      type: String,
      default: null,
    },

    // Human-readable summary of the action
    description: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true, // createdAt serves as the immutable timestamp
  }
);

// Compound indexes for fast dashboard queries
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetModel: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

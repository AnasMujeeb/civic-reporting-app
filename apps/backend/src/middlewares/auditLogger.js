/**
 * auditLogger.js
 *
 * Utility service for creating immutable audit log entries.
 * Called from controllers after state-changing operations.
 *
 * Usage:
 *   const { logAudit } = require('../middlewares/auditLogger');
 *   await logAudit({
 *     actor:       req.user._id,
 *     action:      'ROLE_PROMOTION',
 *     targetModel: 'User',
 *     targetId:    user._id,
 *     changes:     { before: { role: 'CITIZEN' }, after: { role: 'STREET_REP' } },
 *     ipAddress:   req.ip,
 *     description: 'Promoted user to Street Rep',
 *   });
 */

const AuditLog = require('../models/AuditLog');

/**
 * Persist an immutable audit log entry.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.actor        - User who performed the action
 * @param {string}          params.action       - Action identifier (e.g. 'REPORT_STATUS_CHANGE')
 * @param {string}          params.targetModel  - Mongoose model name affected
 * @param {string|ObjectId} params.targetId     - _id of the affected document
 * @param {Object}         [params.changes]     - { before, after } snapshots
 * @param {string}         [params.ipAddress]   - Request IP address
 * @param {string}         [params.description] - Human-readable summary
 * @returns {Promise<Document>} - The created AuditLog document
 */
const logAudit = async ({
  actor,
  action,
  targetModel,
  targetId,
  changes = { before: null, after: null },
  ipAddress = null,
  description = '',
}) => {
  try {
    const log = await AuditLog.create({
      actor,
      action,
      targetModel,
      targetId,
      changes,
      ipAddress,
      description,
    });
    return log;
  } catch (err) {
    // Audit logging should NEVER crash the main request — log and swallow
    console.error('[AuditLogger] Failed to persist audit log:', err.message);
    return null;
  }
};

module.exports = { logAudit };

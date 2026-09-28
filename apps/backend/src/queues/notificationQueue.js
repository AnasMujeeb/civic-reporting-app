/**
 * queues/notificationQueue.js
 *
 * Central notification dispatcher.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  Redis ONLINE  → jobs dispatched via BullMQ              │
 * │  Redis OFFLINE → console.log stub (no crash, no data loss│
 * │                  on the HTTP side — notification is just  │
 * │                  logged for debugging)                    │
 * └──────────────────────────────────────────────────────────┘
 *
 * Usage in any controller:
 *   const { dispatchNotification } = require('../queues/notificationQueue');
 *   await dispatchNotification({ recipientId, type, title, body, data });
 */

const queueConfig = require('../config/queue');

// ── Internal: real BullMQ dispatch ───────────────────────────────────────────
const _dispatchViaQueue = async (payload, jobOptions = {}) => {
  const queue = queueConfig.notificationQueue;

  if (!queue) {
    // This branch shouldn't normally be hit, but guards against race conditions
    // between the async connect() and an early controller call.
    throw new Error('BullMQ queue not yet initialised');
  }

  return queue.add('send-notification', payload, {
    attempts: 3,
    backoff:  { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
    ...jobOptions,
  });
};

// ── Internal: stub mode (Redis offline) ──────────────────────────────────────
const _dispatchStub = (payload) => {
  console.log(
    `[NotificationQueue STUB] 📬 Would send notification:`,
    JSON.stringify({
      to:    payload.recipientId,
      type:  payload.type,
      title: payload.title,
      body:  payload.body,
    }, null, 2)
  );
  // Return a fake job-like object so callers don't break on .id access
  return Promise.resolve({ id: `stub-${Date.now()}`, isFake: true });
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Dispatches a notification job (real queue or stub, depending on Redis).
 *
 * @param {Object} payload
 * @param {string}  payload.recipientId        - MongoDB User _id (string)
 * @param {string} [payload.recipientFcmToken] - Firebase device token
 * @param {string} [payload.recipientPhone]    - Phone for WhatsApp fallback
 * @param {string}  payload.type               - Notification type enum
 * @param {string}  payload.title              - Short notification title
 * @param {string}  payload.body               - Notification body text
 * @param {Object} [payload.data]              - Deep-link data payload
 * @param {Object} [jobOptions]                - BullMQ job options (ignored in stub)
 */
const dispatchNotification = (payload, jobOptions = {}) => {
  if (queueConfig.isRedisReady) {
    return _dispatchViaQueue(payload, jobOptions);
  }
  return _dispatchStub(payload);
};

/**
 * Convenience: dispatch a notification for a report status change.
 */
const dispatchReportStatusNotification = ({ report, newStatus }) => {
  const statusMessages = {
    REP_VERIFIED: { title: '✅ Report Verified',  body: 'A Street Representative has verified your report.' },
    IN_PROGRESS:  { title: '🔧 Work Started',     body: 'A contractor has started working on your reported issue.' },
    FIXED:        { title: '🎉 Issue Fixed!',      body: 'Your reported issue has been resolved. Thank you for helping Karachi!' },
    CLOSED:       { title: '📁 Report Closed',    body: 'Your report has been closed by the administration.' },
    PENDING:      { title: '⏳ Report Pending',    body: 'Your report is pending review.' },
  };

  const msg = statusMessages[newStatus] || {
    title: 'Report Updated',
    body:  `Your report status changed to ${newStatus}.`,
  };

  const recipientId       = report.createdBy?._id?.toString() ?? report.createdBy?.toString();
  const recipientFcmToken = report.createdBy?.fcmToken ?? null;
  const recipientPhone    = report.createdBy?.phone    ?? null;

  return dispatchNotification({
    recipientId,
    recipientFcmToken,
    recipientPhone,
    type:  'REPORT_STATUS_CHANGED',
    title: msg.title,
    body:  msg.body,
    data:  { reportId: report._id },
  });
};

/**
 * Convenience: dispatch a notification when a work order is assigned.
 */
const dispatchWorkOrderNotification = ({ workOrder, contractor, report }) => {
  const recipientId = (contractor.userId?._id || contractor.userId || contractor._id).toString();

  return dispatchNotification({
    recipientId,
    recipientPhone: contractor.phone,
    type:  'WORK_ORDER_ASSIGNED',
    title: '📋 New Work Order Assigned',
    body:  `A work order for "${report.title}" has been assigned to ${contractor.name}.`,
    data:  { workOrderId: workOrder._id, reportId: report._id },
  });
};

module.exports = {
  dispatchNotification,
  dispatchReportStatusNotification,
  dispatchWorkOrderNotification,
};

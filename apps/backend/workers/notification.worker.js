/**
 * notification.worker.js
 * BullMQ Worker — processes every 'send-notification' job from the queue.
 *
 * Responsibilities:
 *  1. Persist the notification to MongoDB (creates in-app inbox record)
 *  2. Send Firebase Cloud Messaging (FCM) push if a device token exists
 *  3. Fall back to WhatsApp (Twilio / Meta API) if FCM token is absent
 *
 * Run this worker as a separate process:
 *   node workers/notification.worker.js
 * OR import it in server.js to run in the same process (simpler for solo dev).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { Worker } = require('bullmq');
const mongoose   = require('mongoose');

// Config imports — use absolute paths so worker can run from any directory
const { connection }   = require('../src/config/queue');
const connectDB        = require('../src/config/db');
const Notification     = require('../src/models/Notification');
const User             = require('../src/models/User');

// ─── Connect to DB ────────────────────────────────────────────────────────────
connectDB();

// ─── FCM Helper (stub — replace with firebase-admin SDK) ─────────────────────
/**
 * @param {string} fcmToken  - The target device's FCM registration token
 * @param {string} title     - Notification title
 * @param {string} body      - Notification body
 * @param {Object} data      - Custom data payload for the app
 * @returns {Promise<boolean>}
 */
const sendFcmPush = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return false;

  /**
   * TODO: Uncomment and configure once firebase-admin is installed:
   *
   * const admin = require('firebase-admin');
   * const serviceAccount = require('../config/firebase-service-account.json');
   *
   * if (!admin.apps.length) {
   *   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
   * }
   *
   * await admin.messaging().send({
   *   token: fcmToken,
   *   notification: { title, body },
   *   data: Object.fromEntries(
   *     Object.entries(data).map(([k, v]) => [k, String(v)])
   *   ),
   * });
   *
   * return true;
   */

  // Dev stub: just log it
  console.log(`[FCM STUB] → Token: ${fcmToken.slice(0, 20)}... | "${title}": ${body}`);
  return true;
};

// ─── WhatsApp Helper (stub — replace with Twilio / Meta Cloud API) ──────────
/**
 * @param {string} phone   - International format e.g. '+923001234567'
 * @param {string} message - Message text
 * @returns {Promise<boolean>}
 */
const sendWhatsApp = async (phone, message) => {
  if (!phone) return false;

  /**
   * TODO: Uncomment once twilio is installed:
   *
   * const twilio = require('twilio');
   * const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
   * await client.messages.create({
   *   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
   *   to:   `whatsapp:${phone}`,
   *   body: message,
   * });
   * return true;
   */

  // Dev stub: just log it
  console.log(`[WhatsApp STUB] → ${phone}: ${message}`);
  return true;
};

// ─── Main Worker ─────────────────────────────────────────────────────────────
const notificationWorker = new Worker(
  'notification-queue',
  async (job) => {
    const {
      recipientId,
      recipientFcmToken,
      recipientPhone,
      type,
      title,
      body,
      data = {},
    } = job.data;

    console.log(`\n[Worker] Processing Job #${job.id} | Type: ${type} | Recipient: ${recipientId}`);

    // 1. Persist notification to MongoDB
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      body,
      data: {
        reportId:    data.reportId    || undefined,
        workOrderId: data.workOrderId || undefined,
        extraPayload: data.extra      || undefined,
      },
    });

    console.log(`[Worker] ✅ Notification saved to DB: ${notification._id}`);

    let fcmSent       = false;
    let whatsappSent  = false;

    // 2. Try FCM push first
    if (recipientFcmToken) {
      try {
        fcmSent = await sendFcmPush(recipientFcmToken, title, body, data);
      } catch (err) {
        console.error(`[Worker] FCM push failed: ${err.message}`);
      }
    }

    // 3. WhatsApp fallback (always send as secondary channel, or if FCM failed)
    if (recipientPhone && (!fcmSent || process.env.WHATSAPP_ALWAYS_SEND === 'true')) {
      try {
        whatsappSent = await sendWhatsApp(recipientPhone, `*${title}*\n${body}`);
      } catch (err) {
        console.error(`[Worker] WhatsApp send failed: ${err.message}`);
      }
    }

    // 4. Update delivery status on the notification document
    await Notification.findByIdAndUpdate(notification._id, {
      'channels.fcmSent':      fcmSent,
      'channels.whatsappSent': whatsappSent,
    });

    console.log(`[Worker] Delivery — FCM: ${fcmSent} | WhatsApp: ${whatsappSent}`);

    return { notificationId: notification._id, fcmSent, whatsappSent };
  },
  {
    connection,
    concurrency: 5, // process up to 5 jobs in parallel
  }
);

// ─── Worker Event Listeners ────────────────────────────────────────────────
notificationWorker.on('completed', (job, result) => {
  console.log(
    `[Worker] ✅ Job #${job.id} completed | Notification: ${result.notificationId}`
  );
});

notificationWorker.on('failed', (job, err) => {
  console.error(
    `[Worker] ❌ Job #${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`
  );
});

notificationWorker.on('error', (err) => {
  console.error('[Worker] Connection error:', err.message);
});

console.log('[Worker] 🚀 Notification Worker started — listening for jobs...');

module.exports = notificationWorker;
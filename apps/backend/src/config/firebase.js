const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

let app;
if (!getApps().length) {
  try {
    const candidatePaths = [
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH && path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH && path.resolve(__dirname, '..', '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
      path.join(__dirname, 'firebase-service-account.json'),
      path.join(__dirname, '..', '..', 'firebase-service-account.json'),
      path.join(process.cwd(), 'firebase-service-account.json'),
      path.join(process.cwd(), 'config', 'firebase-service-account.json'),
      path.join(process.cwd(), 'src', 'config', 'firebase-service-account.json'),
    ].filter(Boolean);

    const foundPath = candidatePaths.find((p) => fs.existsSync(p));

    if (foundPath) {
      console.log('[Firebase Admin] 📄 Loading service account from:', foundPath);
      const serviceAccount = require(foundPath);
      console.log('[Firebase Admin] Service Account project_id:', serviceAccount.project_id);
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || 'digital-karachi',
      });
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'digital-karachi';
      console.warn(`[Firebase Admin] ⚠️ No service account JSON found. Initializing Admin SDK with projectId: "${projectId}"`);
      app = initializeApp({
        projectId,
      });
    }
    console.log('[Firebase Admin] ✅ Initialized successfully.');
  } catch (error) {
    console.error('[Firebase Admin] ❌ Initialization error:', error);
  }
} else {
  app = getApps()[0];
}

const admin = {
  app,
  auth: () => getAuth(app),
  getAuth: () => getAuth(app),
  initializeApp,
  getApps,
  cert,
};

module.exports = admin;
/**
 * cloudinaryHelper.js
 *
 * Hybrid image upload service with automatic fallback.
 *
 * Strategy:
 *   1. If STORAGE_TYPE === 'local' → skip Cloudinary entirely, save to disk.
 *   2. Otherwise, attempt Cloudinary upload.
 *   3. If Cloudinary fails for ANY reason → fallback to local disk.
 *   4. Image uploads NEVER crash or block the main API response.
 *
 * The 403 fix: Windows .env files use \r\n line endings. dotenv may leave
 * trailing \r on values, poisoning the HMAC signature that Cloudinary's
 * upload_stream() uses. We strip \r AND trim whitespace from all env vars.
 */

const cloudinary = require('cloudinary').v2;
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');

// ── Uploads directory (relative to project root) ──────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure the uploads directory exists on module load
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`[Storage] Created local uploads directory: ${UPLOADS_DIR}`);
}

let _configured = false;

/**
 * Sanitize an env var: trim whitespace AND strip \r (Windows line endings).
 * This is the root cause fix for the 403 — \r in API secret poisons the
 * HMAC-SHA256 signature that Cloudinary's signed upload flow computes.
 */
const sanitizeEnv = (value) => (value || '').trim().replace(/\r/g, '');

/**
 * Lazily configure Cloudinary credentials on first use.
 * Returns true if configuration succeeded, false otherwise.
 */
const ensureConfigured = () => {
  if (_configured) return true;

  const cloudName = sanitizeEnv(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey    = sanitizeEnv(process.env.CLOUDINARY_API_KEY);
  const apiSecret = sanitizeEnv(process.env.CLOUDINARY_API_SECRET);

  if (!cloudName || !apiKey || !apiSecret) {
    console.warn(
      '[Cloudinary] Missing credentials. Set CLOUDINARY_CLOUD_NAME, '
      + 'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env. '
      + 'Falling back to local storage.'
    );
    return false;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key:    apiKey,
    api_secret: apiSecret,
    secure:     true,
  });

  _configured = true;
  console.log(`[Cloudinary] Configured for cloud "${cloudName}"`);
  return true;
};

/**
 * Upload a file buffer to Cloudinary via upload_stream.
 *
 * @param {Buffer} fileBuffer — raw file bytes from Multer
 * @param {string} [folder]  — Cloudinary folder path
 * @returns {Promise<object>} — Cloudinary upload result
 */
const uploadToCloudinary = (fileBuffer, folder = 'digital_karachi/reports') => {
  if (!ensureConfigured()) {
    return Promise.reject(new Error('Cloudinary not configured'));
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload failed:', {
            message: error.message,
            http_code: error.http_code,
          });

          // If it's an auth/signature error (403), reset _configured so
          // a server restart with corrected .env can reconfigure.
          if (error.http_code === 403 || error.http_code === 401) {
            _configured = false;
            console.warn(
              '[Cloudinary] Auth failure (403/401) — credentials may be invalid. '
              + 'Resetting configuration so next attempt will re-read .env.'
            );
          }

          return reject(error);
        }
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Save a file buffer to the local /uploads directory.
 *
 * @param {Buffer} fileBuffer — raw file bytes
 * @param {string} [originalName] — original filename for extension detection
 * @returns {Promise<object>} — { secure_url, public_id, storage: 'local' }
 */
const saveToLocal = async (fileBuffer, originalName = 'image.jpg') => {
  const ext      = path.extname(originalName).toLowerCase() || '.jpg';
  const uniqueId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const filename = `${uniqueId}${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  await fs.promises.writeFile(filePath, fileBuffer);

  console.log(`[Storage] Saved locally: ${filePath}`);

  // Build a URL that express.static('/uploads') will serve
  const localUrl = `/uploads/${filename}`;

  return {
    secure_url: localUrl,
    public_id:  `local/${uniqueId}`,
    storage:    'local',
  };
};

/**
 * HYBRID UPLOAD — the main function controllers should use.
 *
 * 1. If STORAGE_TYPE === 'local', skip Cloudinary entirely.
 * 2. Otherwise try Cloudinary; on ANY failure, fallback to local disk.
 * 3. NEVER throws — always returns a result with at least { secure_url }.
 *
 * @param {Buffer} fileBuffer    — raw file bytes from Multer
 * @param {string} [folder]      — Cloudinary folder path
 * @param {string} [originalName] — original filename (for extension)
 * @returns {Promise<object>}    — { secure_url, public_id, storage }
 */
const uploadImage = async (fileBuffer, folder = 'digital_karachi/reports', originalName = 'image.jpg') => {
  const storageType = sanitizeEnv(process.env.STORAGE_TYPE).toLowerCase();

  // ── Force local storage if configured ──────────────────────────────────
  if (storageType === 'local') {
    console.log('[Storage] STORAGE_TYPE=local — saving to disk.');
    return saveToLocal(fileBuffer, originalName);
  }

  // ── Try Cloudinary first ───────────────────────────────────────────────
  try {
    const result = await uploadToCloudinary(fileBuffer, folder);
    return { ...result, storage: 'cloudinary' };
  } catch (cloudErr) {
    console.warn(
      `[Storage] Cloudinary upload failed (${cloudErr.message}). Falling back to local disk.`
    );

    // ── Fallback to local ────────────────────────────────────────────────
    try {
      return await saveToLocal(fileBuffer, originalName);
    } catch (localErr) {
      // This is the absolute last resort — should almost never happen
      console.error('[Storage] Local fallback ALSO failed:', localErr.message);
      throw new Error('Image upload failed (both Cloudinary and local storage). Please try again.');
    }
  }
};

module.exports = {
  uploadToCloudinary,
  uploadImage,
  saveToLocal,
};
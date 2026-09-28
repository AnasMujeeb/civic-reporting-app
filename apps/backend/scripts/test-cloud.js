/**
 * test-cloud.js — Cloudinary Diagnostic Script
 *
 * Tests both credential validity (api.ping) AND upload permissions.
 * Run with:  node scripts/test-cloud.js
 *
 * If ping succeeds but upload returns 403, the issue is:
 *   - API secret has invisible characters (\r from Windows .env)
 *   - The Cloudinary account has upload restrictions
 *   - Timestamp drift > 1 hour
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cloudinary = require('cloudinary').v2;

// ── Sanitize env vars (strip \r from Windows line endings) ────────────────────
const sanitize = (v) => (v || '').trim().replace(/\r/g, '');

const CLOUD_NAME = sanitize(process.env.CLOUDINARY_CLOUD_NAME);
const API_KEY    = sanitize(process.env.CLOUDINARY_API_KEY);
const API_SECRET = sanitize(process.env.CLOUDINARY_API_SECRET);

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║       Cloudinary Diagnostic Script               ║');
console.log('╚══════════════════════════════════════════════════╝\n');

console.log('── Loaded Credentials ──────────────────────────────');
console.log(`  Cloud Name : "${CLOUD_NAME}"`);
console.log(`  API Key    : "${API_KEY}"`);
console.log(`  API Secret : "${API_SECRET.slice(0, 6)}...${'*'.repeat(API_SECRET.length - 6)}"`);
console.log(`  Secret len : ${API_SECRET.length} chars`);

// Check for invisible chars
const rawSecret = process.env.CLOUDINARY_API_SECRET || '';
if (rawSecret !== API_SECRET) {
  console.warn('\n  ⚠️  WARNING: Raw env var differs from sanitized value!');
  console.warn(`     Raw bytes   : [${Buffer.from(rawSecret).toString('hex')}]`);
  console.warn(`     Clean bytes : [${Buffer.from(API_SECRET).toString('hex')}]`);
  console.warn('     → This is likely the cause of 403 errors (\\r in secret).\n');
}

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('\n❌ Missing credentials. Check your .env file.\n');
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key:    API_KEY,
  api_secret: API_SECRET,
  secure:     true,
});

(async () => {
  // ── Test 1: API Ping ──────────────────────────────────────────────────
  console.log('\n── Test 1: api.ping() ──────────────────────────────');
  try {
    const ping = await cloudinary.api.ping();
    console.log('  ✅ Ping OK:', JSON.stringify(ping));
  } catch (err) {
    console.error('  ❌ Ping FAILED:', err.message);
    console.error('     → Credentials are invalid or network is down.');
    process.exit(1);
  }

  // ── Test 2: Upload a 1x1 red PNG ──────────────────────────────────────
  console.log('\n── Test 2: upload_stream (1x1 red PNG) ────────────');
  try {
    // Minimal valid PNG (1x1 red pixel)
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de' +
      '0000000c4944415408d763f8cfc000000002000160e534270000000049454e44ae426082',
      'hex'
    );

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'digital_karachi/_diagnostic_test', tags: ['test'] },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(pngBuffer);
    });

    console.log('  ✅ Upload OK!');
    console.log(`     URL       : ${result.secure_url}`);
    console.log(`     Public ID : ${result.public_id}`);
    console.log(`     Storage   : cloudinary`);

    // Clean up the test upload
    try {
      await cloudinary.uploader.destroy(result.public_id);
      console.log('  🧹 Test image cleaned up from Cloudinary.');
    } catch (cleanErr) {
      console.warn(`  ⚠️  Could not clean up test image: ${cleanErr.message}`);
    }
  } catch (err) {
    console.error('  ❌ Upload FAILED:', {
      message:   err.message,
      http_code: err.http_code,
    });

    if (err.http_code === 403) {
      console.error('\n  → 403 Forbidden means the SIGNATURE is invalid.');
      console.error('    Possible causes:');
      console.error('    1. API Secret has invisible chars (\\r from Windows .env)');
      console.error('    2. System clock is >1 hour off (timestamp in signature expired)');
      console.error('    3. This Cloudinary account has upload restrictions enabled');
    }

    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  🎉 All tests passed! Cloudinary is working.');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
})();

const ExifParser = require('exif-parser');

// ── Configurable freshness window (default: 48 hours) ─────────────────────────
const FRESHNESS_HOURS = parseInt(process.env.EXIF_FRESHNESS_HOURS) || 48;

/**
 * Extract EXIF GPS data + validate photo freshness.
 *
 * Returns an object with:
 *   hasGps       — true if the image contains GPS coordinates
 *   latitude     — GPS latitude (if present)
 *   longitude    — GPS longitude (if present)
 *   capturedAt   — Date when the photo was taken (if present)
 *   isFresh      — null if no timestamp, true/false if timestamp exists
 *   freshnessMsg — human-readable explanation when isFresh === false
 *
 * @param {Buffer} fileBuffer — raw image file buffer
 * @returns {object}
 */
exports.extractExifData = (fileBuffer) => {
  try {
    const parser = ExifParser.create(fileBuffer);
    const result = parser.parse();

    const capturedAt = result?.tags?.DateTimeOriginal
      ? new Date(result.tags.DateTimeOriginal * 1000)
      : null;

    // ── Freshness check ─────────────────────────────────────────────────
    let isFresh = null;       // null = no timestamp available (can't verify)
    let freshnessMsg = null;

    if (capturedAt) {
      const now          = Date.now();
      const ageMs        = now - capturedAt.getTime();
      const maxAgeMs     = FRESHNESS_HOURS * 60 * 60 * 1000;

      if (capturedAt.getTime() > now) {
        // Timestamp is in the future — clock-spoofed or manipulated
        isFresh      = false;
        freshnessMsg = 'Photo EXIF timestamp is set in the future — possible manipulation.';
      } else if (ageMs > maxAgeMs) {
        // Photo is too old (recycled / web-scraped image)
        isFresh      = false;
        freshnessMsg = `Photo was taken ${Math.round(ageMs / (1000 * 60 * 60))} hours ago, `
                     + `exceeding the ${FRESHNESS_HOURS}-hour freshness limit.`;
      } else {
        isFresh = true;
      }
    }

    if (result?.tags?.GPSLatitude && result?.tags?.GPSLongitude) {
      return {
        hasGps: true,
        latitude:  result.tags.GPSLatitude,
        longitude: result.tags.GPSLongitude,
        capturedAt,
        isFresh,
        freshnessMsg,
      };
    }

    return { hasGps: false, capturedAt, isFresh, freshnessMsg };
  } catch (error) {
    console.error('EXIF Parsing Error:', error.message);
    return { hasGps: false, capturedAt: null, isFresh: null, freshnessMsg: null };
  }
};
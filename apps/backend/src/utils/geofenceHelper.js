/**
 * geofenceHelper.js
 *
 * Validates that GPS coordinates fall within the Greater Karachi bounding box.
 * Reports submitted with out-of-bounds coordinates are rejected.
 *
 * Bounding box (approximate Greater Karachi metropolitan area):
 *   Latitude:  24.70 – 25.10
 *   Longitude: 66.90 – 67.30
 */

// ── Karachi Bounding Box ──────────────────────────────────────────────────────
const KARACHI_BOUNDS = {
  lat: { min: 24.70, max: 25.10 },
  lng: { min: 66.90, max: 67.30 },
};

/**
 * Check whether coordinates fall within Greater Karachi.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{ isValid: boolean, message?: string }}
 */
const validateKarachiBounds = (latitude, longitude) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    return { isValid: false, message: 'Invalid coordinates: latitude and longitude must be numbers.' };
  }

  const latOk = lat >= KARACHI_BOUNDS.lat.min && lat <= KARACHI_BOUNDS.lat.max;
  const lngOk = lng >= KARACHI_BOUNDS.lng.min && lng <= KARACHI_BOUNDS.lng.max;

  if (!latOk || !lngOk) {
    return {
      isValid: false,
      message: `Coordinates (${lat}, ${lng}) are outside the Greater Karachi boundary. `
             + `Accepted range: lat ${KARACHI_BOUNDS.lat.min}–${KARACHI_BOUNDS.lat.max}, `
             + `lng ${KARACHI_BOUNDS.lng.min}–${KARACHI_BOUNDS.lng.max}.`,
    };
  }

  return { isValid: true };
};

module.exports = { validateKarachiBounds, KARACHI_BOUNDS };

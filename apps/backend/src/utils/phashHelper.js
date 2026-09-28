/**
 * phashHelper.js
 *
 * Generates a simplified perceptual hash (pHash) fingerprint from an image
 * buffer using Sharp. Used for detecting duplicate/near-identical photo
 * submissions across reports (anti-spam / anti-fraud).
 *
 * Algorithm:
 *  1. Resize to a small grayscale 8x8 thumbnail (64 pixels).
 *  2. Compute the mean luminance of all 64 pixels.
 *  3. For each pixel, emit '1' if it is >= mean, else '0'.
 *  4. The resulting 64-character binary string is the pHash.
 *
 * Two images with a Hamming distance <= threshold (e.g. 10 bits out of 64)
 * are considered "near-identical".
 */

const sharp = require('sharp');

/**
 * Generate a 64-bit perceptual hash string from an image buffer.
 * @param {Buffer} imageBuffer — raw file buffer (JPEG, PNG, etc.)
 * @returns {Promise<string>} — 64-char binary string (e.g. '10110100...')
 */
const generatePHash = async (imageBuffer) => {
  // Resize to 8×8 grayscale, extract raw pixel data
  const { data } = await sharp(imageBuffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Compute mean luminance across all 64 pixels
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  const mean = sum / data.length;

  // Build the hash: '1' if pixel >= mean, else '0'
  let hash = '';
  for (let i = 0; i < data.length; i++) {
    hash += data[i] >= mean ? '1' : '0';
  }

  return hash;
};

/**
 * Compute the Hamming distance between two pHash strings.
 * Lower distance = more similar images.
 * @param {string} hash1
 * @param {string} hash2
 * @returns {number} — number of differing bits (0 = identical)
 */
const hammingDistance = (hash1, hash2) => {
  if (hash1.length !== hash2.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
};

module.exports = { generatePHash, hammingDistance };

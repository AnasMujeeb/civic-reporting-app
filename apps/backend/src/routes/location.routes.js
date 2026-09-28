const express = require('express');
const router = express.Router();
const locationController = require('../controllers/location.controller');

// GET /api/v1/location/reverse-geocode?lat=24.9180&lng=67.0971
router.get('/reverse-geocode', locationController.reverseGeocode);

module.exports = router;

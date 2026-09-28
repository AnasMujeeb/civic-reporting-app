const express = require('express');
const { register, login, getMe, sendOtp, verifyOtp, updateProfile, firebasePhoneLogin } = require('../controllers/authController');
const { registerValidation, loginValidation } = require('../validators/auth.validator');
const validate = require('../middlewares/validate.middleware');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const { firebaseLoginLimiter, otpLimiter } = require('../middlewares/redisRateLimiter');

const router = express.Router();

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/firebase-login', firebaseLoginLimiter, firebasePhoneLogin);
router.get('/me', protect, getMe);
router.get('/verify-session', protect, getMe);
router.put('/profile', protect, upload.single('avatar'), updateProfile);

module.exports = router;
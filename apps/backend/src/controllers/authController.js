const User = require('../models/User');
const jwt = require('jsonwebtoken');
const admin = require('../config/firebase');
const { getCache, setCache, deleteCache } = require('../utils/redisHelper');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '30d' });
};

// In-memory OTP store (phone -> { otp, expiresAt })
const otpStore = new Map();

const OFFICER_SECRET_KEY = process.env.OFFICER_SECRET_KEY || 'KHI_UC_2026';
const MAYOR_SECRET_KEY   = process.env.MAYOR_SECRET_KEY || 'KHI_MAYOR_2026';
const OFFICER_ROLES      = ['UC_OFFICER', 'STREET_REP', 'CONTRACTOR', 'ADMIN'];
const PRIVILEGED_ROLES   = ['UC_OFFICER', 'STREET_REP', 'CONTRACTOR', 'MAYOR', 'ADMIN'];

const validateRoleRegistration = (role, officialCode) => {
  if (!role || role === 'CITIZEN') {
    return { assignedRole: 'CITIZEN' };
  }
  if (role === 'MAYOR') {
    if (!officialCode || String(officialCode).trim() !== MAYOR_SECRET_KEY) {
      return {
        error: 'Access Denied: Valid Mayor Secret Key is required to register as Mayor.',
      };
    }
    return { assignedRole: 'MAYOR' };
  }
  if (OFFICER_ROLES.includes(role)) {
    if (!officialCode || String(officialCode).trim() !== OFFICER_SECRET_KEY) {
      return {
        error: 'Access Denied: Valid Official Secret Code is required to register as UC Officer, Street Rep, or Contractor.',
      };
    }
    return { assignedRole: role };
  }
  return { assignedRole: 'CITIZEN' };
};

// Normalize phone number to standard E.164 (+923001234567)
const normalizePhone = (inputPhone) => {
  if (!inputPhone) return '';
  const cleaned = String(inputPhone).trim();
  const digits = cleaned.replace(/\D/g, '');

  if (digits.startsWith('92') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+92${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+92${digits}`;
  }
  if (cleaned.startsWith('+')) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : '';
};

// Generate multi-format query to match phone regardless of storage formatting
const getPhoneSearchQuery = (inputPhone) => {
  if (!inputPhone) return null;
  const raw = String(inputPhone).trim();
  const digits = raw.replace(/\D/g, '');

  const clean92 = digits.startsWith('92')
    ? digits
    : digits.startsWith('0')
      ? `92${digits.slice(1)}`
      : `92${digits}`;
  const local0 = clean92.startsWith('92') ? `0${clean92.slice(2)}` : clean92;
  const raw10 = clean92.startsWith('92') ? clean92.slice(2) : clean92;

  const variants = [
    `+${clean92}`,                                  // +923001111111
    clean92,                                        // 923001111111
    local0,                                         // 03001111111
    raw10,                                          // 3001111111
    `+92 ${raw10}`,                                 // +92 3001111111
    `+92 ${raw10.slice(0, 3)} ${raw10.slice(3)}`,   // +92 300 1111111
    `0${raw10.slice(0, 3)} ${raw10.slice(3)}`,      // 0300 1111111
    raw,
  ];

  return { $in: [...new Set(variants.filter(Boolean))] };
};

// ─── 1. Register ──────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, phone, password, role, officialCode, ucNumber, zone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const normalizedPhone = normalizePhone(phone) || String(phone).trim();
    const userExists = await User.findOne({ phone: getPhoneSearchQuery(phone) });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists with this phone number' });
    }

    const roleValidation = validateRoleRegistration(role, officialCode);
    if (roleValidation.error) {
      return res.status(403).json({
        success: false,
        message: roleValidation.error,
      });
    }
    const assignedRole = roleValidation.assignedRole;

    const user = await User.create({
      name,
      phone: normalizedPhone,
      password,
      role: assignedRole,
      ucNumber: (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? ucNumber : null,
      zone: (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? zone : null,
    });

    const token = generateToken(user._id, user.role);
    const userPayload = {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      ucNumber: user.ucNumber,
      zone: user.zone,
    };

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userPayload,
      data: {
        ...userPayload,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. Login ─────────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { phone, email, password } = req.body;

    // Support login via email or phone — accept either field, or auto-detect
    const loginIdentifier = email || phone;

    if (!loginIdentifier || !String(loginIdentifier).trim()) {
      return res.status(400).json({ success: false, message: 'Phone number or email is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const trimmedIdentifier = String(loginIdentifier).trim();
    const isEmail = trimmedIdentifier.includes('@');

    let user;
    if (isEmail) {
      // Email-based lookup (case-insensitive)
      user = await User.findOne({ email: { $regex: new RegExp(`^${trimmedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    } else {
      // Phone-based lookup with multi-format matching
      const phoneQuery = getPhoneSearchQuery(trimmedIdentifier);
      user = await User.findOne({ phone: phoneQuery });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: isEmail
          ? 'User not found. Please check your email address or register a new account.'
          : 'User not found. Please check your phone number or register a new account.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password. Please enter the correct password.',
      });
    }

    const token = generateToken(user._id, user.role);
    const userPayload = {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      ucNumber: user.ucNumber,
      zone: user.zone,
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userPayload,
      data: {
        ...userPayload,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 3. Send OTP ──────────────────────────────────────────────────────────────
exports.sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const normalizedPhone = normalizePhone(phone) || String(phone).trim();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStore.set(normalizedPhone, { otp, expiresAt });
    if (normalizedPhone !== String(phone).trim()) {
      otpStore.set(String(phone).trim(), { otp, expiresAt });
    }

    console.log(`[DEV MODE] OTP for ${normalizedPhone} (${phone}): ${otp}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      devOtp: otp,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 4. Verify OTP ────────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp, name, password, role, officialCode, ucNumber, zone } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    const normalizedPhone = normalizePhone(phone) || String(phone).trim();
    const storedData = otpStore.get(normalizedPhone) || otpStore.get(String(phone).trim());
    const isBypass = process.env.NODE_ENV === 'development' && (otp === '1234' || otp === '123456');
    const isValidOtp = isBypass || (storedData && storedData.otp === otp && Date.now() < storedData.expiresAt);

    if (!isValidOtp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    otpStore.delete(normalizedPhone);
    otpStore.delete(String(phone).trim());

    const roleValidation = validateRoleRegistration(role, officialCode);
    if (roleValidation.error) {
      return res.status(403).json({
        success: false,
        message: roleValidation.error,
      });
    }
    const assignedRole = roleValidation.assignedRole;

    let user = await User.findOne({ phone: getPhoneSearchQuery(phone) });
    if (!user) {
      user = await User.create({
        name: name || `Citizen (${normalizedPhone.slice(-4)})`,
        phone: normalizedPhone,
        password: password || 'OtpUser@123456',
        role: assignedRole,
        ucNumber: (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? ucNumber : null,
        zone: (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? zone : null,
      });
    } else if (name || role || ucNumber || zone) {
      if (name) user.name = name;
      if (role) user.role = assignedRole;
      if (ucNumber) user.ucNumber = (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? ucNumber : null;
      if (zone) user.zone = (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? zone : null;
      if (password) user.password = password;
      await user.save();
    }

    const token = generateToken(user._id, user.role);

    const userPayload = {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      ucNumber: user.ucNumber,
      zone: user.zone,
    };

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: userPayload,
      data: {
        token,
        user: userPayload,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 5. Get Current User Profile (Redis-cached, TTL 1 hour) ──────────────────
exports.getMe = async (req, res, next) => {
  try {
    const cacheKey = `user:profile:${req.user._id}`;

    // 1. Try Redis first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        user: cached,
        source: 'cache',
      });
    }

    // 2. Fallback to MongoDB
    const user = await User.findById(req.user._id).select('-password').lean();

    // 3. Populate cache for next request (TTL: 3600s = 1 hour)
    if (user) {
      await setCache(cacheKey, user, 3600);
    }

    res.status(200).json({
      success: true,
      data: user,
      user,
      source: 'db',
    });
  } catch (error) {
    next(error);
  }
};

// ─── 6. Update Profile (Name, Email, Phone, Password & Avatar) — invalidates Redis cache ───────
exports.updateProfile = async (req, res, next) => {
  try {
    const { uploadImage } = require('../utils/cloudinaryHelper');
    const userId = req.user._id;
    const { name, email, phone, currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User record not found.' });
    }

    // 1. Password Change Validation
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to set a new password.',
        });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters long.',
        });
      }
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password entered is incorrect.',
        });
      }
      user.password = newPassword;
    }

    // 2. Name Update
    if (name && name.trim()) {
      user.name = name.trim();
    }

    // 3. Email Update
    if (email && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase();
      if (trimmedEmail !== (user.email || '').toLowerCase()) {
        const existingEmail = await User.findOne({ email: trimmedEmail, _id: { $ne: userId } });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'Email address is already registered to another account.',
          });
        }
        user.email = trimmedEmail;
      }
    }

    // 4. Phone Update
    if (phone && phone.trim()) {
      const trimmedPhone = phone.trim();
      if (trimmedPhone !== user.phone) {
        const existingPhone = await User.findOne({ phone: getPhoneSearchQuery(trimmedPhone), _id: { $ne: userId } });
        if (existingPhone) {
          return res.status(400).json({
            success: false,
            message: 'Phone number is already registered to another account.',
          });
        }
        user.phone = trimmedPhone;
      }
    }

    // 5. Avatar Upload
    if (req.file) {
      const uploadResult = await uploadImage(
        req.file.buffer,
        'digital_karachi/avatars',
        req.file.originalname || `avatar_${userId}.jpg`
      );
      user.avatar = uploadResult.secure_url;
    }

    await user.save();

    // Invalidate cached profile so next getMe / verify-session fetches fresh data
    await deleteCache(`user:profile:${userId}`);

    const safeUser = {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      ucNumber: user.ucNumber,
      zone: user.zone,
    };

    res.status(200).json({
      success: true,
      message: 'Executive profile updated successfully',
      data: safeUser,
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 7. Firebase Phone Authentication Login ──────────────────────────────────
exports.firebasePhoneLogin = async (req, res) => {
  try {
    const { idToken, role, name, officialCode, ucNumber, zone } = req.body;

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: 'Firebase ID Token is required',
      });
    }

    // Verify Firebase ID Token (checkRevoked set to false for dev/resilient verification)
    const decodedToken = await admin.auth().verifyIdToken(idToken, false);
    const phoneNumber = decodedToken.phone_number;

    if (!phoneNumber) {
      return res.status(401).json({
        success: false,
        message: 'No phone number found in verified Firebase ID token',
      });
    }

    const normalizedPhone = normalizePhone(phoneNumber) || String(phoneNumber).trim();
    const phoneQuery = getPhoneSearchQuery(phoneNumber);

    let user = await User.findOne({ phone: phoneQuery });

    if (!user) {
      const roleValidation = validateRoleRegistration(role, officialCode);
      const assignedRole = roleValidation.error ? 'CITIZEN' : (roleValidation.assignedRole || 'CITIZEN');

      user = await User.create({
        phone: normalizedPhone,
        name: name && String(name).trim() ? String(name).trim() : 'Resident',
        role: assignedRole,
        password: Math.random().toString(36).slice(-10) + 'Aa1!',
        isPhoneVerified: true,
        ucNumber: (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? ucNumber : null,
        zone: (assignedRole === 'UC_OFFICER' || assignedRole === 'STREET_REP' || assignedRole === 'MAYOR') ? zone : null,
      });
    } else {
      user.isPhoneVerified = true;
      if (name && String(name).trim() && (!user.name || user.name === 'Resident')) {
        user.name = String(name).trim();
      }
      await user.save();
    }

    const token = generateToken(user._id, user.role);

    const userPayload = {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      ucNumber: user.ucNumber,
      zone: user.zone,
      isPhoneVerified: user.isPhoneVerified,
    };

    return res.status(200).json({
      success: true,
      token,
      user: userPayload,
    });
  } catch (error) {
    console.error('[Backend Firebase Login Error]:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired Firebase token. Verification failed.',
      error: error.message || error.code || String(error),
    });
  }
};
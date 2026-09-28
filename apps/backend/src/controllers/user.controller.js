const User = require('../models/User');
const { logAudit } = require('../middlewares/auditLogger');

// ─── 1. Get All Users (Paginated, Searchable, Role Filter) ──────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;

    const filter = {};

    // Role filter
    if (req.query.role) filter.role = req.query.role;

    // Name/phone search (case-insensitive partial match)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name:  searchRegex },
        { phone: searchRegex },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. Promote / Change User Role ──────────────────────────────────────────
exports.updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['CITIZEN', 'STREET_REP', 'CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${validRoles.join(', ')}`,
      });
    }

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent self-demotion
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role.' });
    }

    const previousRole = user.role;
    user.role = role;
    await user.save();

    // ── Audit log ────────────────────────────────────────────────────────
    await logAudit({
      actor:       req.user._id,
      action:      'ROLE_PROMOTION',
      targetModel: 'User',
      targetId:    user._id,
      changes:     { before: { role: previousRole }, after: { role } },
      ipAddress:   req.ip,
      description: `Role changed from ${previousRole} to ${role} for user "${user.name}"`,
    });

    res.status(200).json({
      success: true,
      message: `User role updated: ${previousRole} → ${role}`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 3. Assign UC Number / Zone to a User (Street Rep or UC Officer) ────────
exports.assignUcZone = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ucNumber, zone } = req.body;

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!['STREET_REP', 'UC_OFFICER'].includes(user.role)) {
      return res.status(400).json({
        success: false,
        message: `UC/zone assignment is only valid for STREET_REP or UC_OFFICER roles. This user is ${user.role}.`,
      });
    }

    const before = { ucNumber: user.ucNumber, zone: user.zone };

    if (ucNumber !== undefined) user.ucNumber = ucNumber;
    if (zone !== undefined)     user.zone     = zone;
    await user.save();

    // ── Audit log ────────────────────────────────────────────────────────
    await logAudit({
      actor:       req.user._id,
      action:      'UC_ZONE_ASSIGNMENT',
      targetModel: 'User',
      targetId:    user._id,
      changes:     { before, after: { ucNumber: user.ucNumber, zone: user.zone } },
      ipAddress:   req.ip,
      description: `UC/Zone assignment updated for "${user.name}"`,
    });

    res.status(200).json({
      success: true,
      message: 'UC and zone assignment updated.',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

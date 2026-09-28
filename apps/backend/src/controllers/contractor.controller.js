const Contractor = require('../models/contractor.model');
const User = require('../models/User');

// Register a new contractor (Admin only)
exports.createContractor = async (req, res, next) => {
  try {
    const { userId, name, phone, category } = req.body;

    const contractor = await Contractor.create({
      userId: userId || req.user?._id,
      name,
      phone,
      category,
    });

    res.status(201).json({
      success: true,
      data: contractor,
    });
  } catch (error) {
    next(error);
  }
};

// Get all contractors with filter and flexible regex search options
exports.getAllContractors = async (req, res, next) => {
  try {
    const { category, isBlacklisted, search } = req.query;

    const query = {};

    if (category) query.category = category;
    if (isBlacklisted !== undefined) query.isBlacklisted = isBlacklisted === 'true';

    // Case-insensitive regex search matching against name, phone, companyName, category, tradeCategory
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { companyName: { $regex: s, $options: 'i' } },
        { category: { $regex: s, $options: 'i' } },
        { tradeCategory: { $regex: s, $options: 'i' } },
      ];
    }

    const contractors = await Contractor.find(query).sort('-createdAt');

    res.status(200).json({
      success: true,
      count: contractors.length,
      data: contractors,
    });
  } catch (error) {
    next(error);
  }
};

// Update contractor rating or blacklist status (Admin/UC Officer)
exports.updateContractorStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, isBlacklisted, blacklistedReason } = req.body;

    const updateFields = {};
    if (rating !== undefined) updateFields.rating = rating;
    if (isBlacklisted !== undefined) {
      updateFields.isBlacklisted = isBlacklisted;
      if (isBlacklisted) updateFields.blacklistedReason = blacklistedReason || 'Not specified';
    }

    const contractor = await Contractor.findByIdAndUpdate(
      id, 
      updateFields, 
      { new: true, runValidators: true }
    );

    if (!contractor) {
      return res.status(404).json({ success: false, message: 'Contractor not found' });
    }

    res.status(200).json({
      success: true,
      data: contractor
    });
  } catch (error) {
    next(error);
  }
};
const Budget = require('../models/Budget');

// ─── 1. Create Budget Allocation (MAYOR / ADMIN) ────────────────────────────
exports.createBudget = async (req, res, next) => {
  try {
    const { ucId, allocatedAmount, spentAmount, workOrderId, category, description } = req.body;

    const budget = await Budget.create({
      ucId,
      allocatedAmount,
      spentAmount: spentAmount || 0,
      workOrderId: workOrderId || null,
      category,
      description,
      approvedBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Budget allocation created successfully',
      data: budget,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. List Budget Allocations (UC_OFFICER / MAYOR / ADMIN) ────────────────
exports.getAllBudgets = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;

    // ── Filters ───────────────────────────────────────────────────────────
    const filter = {};
    if (req.query.ucId)     filter.ucId     = req.query.ucId;
    if (req.query.category) filter.category = req.query.category;

    const [budgets, total] = await Promise.all([
      Budget.find(filter)
        .populate('approvedBy', 'name role')
        .populate('workOrderId', 'status deadline')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      Budget.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: budgets,
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

// ─── 3. Budget Summary — Aggregate allocated vs spent per UC (Mayor Dashboard)
exports.getBudgetSummary = async (req, res, next) => {
  try {
    const summary = await Budget.aggregate([
      {
        $group: {
          _id: '$ucId',
          totalAllocated: { $sum: '$allocatedAmount' },
          totalSpent:     { $sum: '$spentAmount' },
          count:          { $sum: 1 },
        },
      },
      {
        $addFields: {
          remaining: { $subtract: ['$totalAllocated', '$totalSpent'] },
          utilizationPercent: {
            $cond: {
              if:   { $eq: ['$totalAllocated', 0] },
              then: 0,
              else: {
                $multiply: [
                  { $divide: ['$totalSpent', '$totalAllocated'] },
                  100,
                ],
              },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Also compute grand totals across all UCs
    const grandTotal = summary.reduce(
      (acc, uc) => {
        acc.totalAllocated += uc.totalAllocated;
        acc.totalSpent     += uc.totalSpent;
        acc.remaining      += uc.remaining;
        return acc;
      },
      { totalAllocated: 0, totalSpent: 0, remaining: 0 }
    );

    res.status(200).json({
      success: true,
      data: {
        byUC: summary,
        grandTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 4. Mayor Dynamic Budget Allocation & Edit (MAYOR / OPS / ADMIN) ─────────
exports.allocateBudget = async (req, res, next) => {
  try {
    const { targetType, ucNumber, totalAllocated, notes, category } = req.body;

    if (totalAllocated === undefined || totalAllocated === null || isNaN(Number(totalAllocated))) {
      return res.status(400).json({
        success: false,
        message: 'Valid totalAllocated amount (numeric) is required',
      });
    }

    const parsedAllocated = Math.max(0, Number(totalAllocated));
    const targetUcId = targetType === 'UC' && ucNumber ? String(ucNumber).trim() : 'CITY';
    const validCategory = category || 'OTHER';

    let budget = await Budget.findOne({ ucId: targetUcId });

    if (budget) {
      budget.allocatedAmount = parsedAllocated;
      if (notes !== undefined) budget.description = notes;
      if (category) budget.category = validCategory;
      budget.approvedBy = req.user._id;
      await budget.save();
    } else {
      budget = await Budget.create({
        ucId: targetUcId,
        allocatedAmount: parsedAllocated,
        spentAmount: 0,
        category: validCategory,
        description: notes || (targetType === 'CITY' ? 'City-wide budget allocation pool' : `UC ${targetUcId} budget allocation`),
        approvedBy: req.user._id,
      });
    }

    const remainingReserve = Math.max(0, budget.allocatedAmount - budget.spentAmount);

    res.status(200).json({
      success: true,
      message: `Budget successfully allocated for ${targetUcId === 'CITY' ? 'City-Wide Pool' : targetUcId}`,
      data: {
        budget,
        ucId: targetUcId,
        targetType: targetType || (targetUcId === 'CITY' ? 'CITY' : 'UC'),
        totalAllocated: budget.allocatedAmount,
        totalSpent: budget.spentAmount,
        remainingReserve,
      },
    });
  } catch (error) {
    next(error);
  }
};


const mongoose = require('mongoose');

/**
 * Budget & Expense Tracking Model
 *
 * Each document represents a budget allocation for a Union Council (UC),
 * optionally linked to a specific work order. Tracks allocated vs spent
 * amounts for financial oversight on the Mayor dashboard.
 */
const budgetSchema = new mongoose.Schema(
  {
    ucId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    allocatedAmount: {
      type: Number,
      required: true,
      min: [0, 'Allocated amount cannot be negative'],
    },

    spentAmount: {
      type: Number,
      default: 0,
      min: [0, 'Spent amount cannot be negative'],
    },

    workOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder',
      default: null,
    },

    category: {
      type: String,
      required: true,
      enum: ['ROAD_REPAIR', 'SANITATION', 'STREET_LIGHTS', 'DRAINAGE', 'WATER_SUPPLY', 'OTHER'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Compound index for fast UC + category queries on the Mayor dashboard
budgetSchema.index({ ucId: 1, category: 1 });

module.exports = mongoose.model('Budget', budgetSchema);

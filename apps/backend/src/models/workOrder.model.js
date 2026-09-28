const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({
  reportId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Report', 
    required: true 
  },
  contractorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Contractor', 
    required: true 
  },
  assignedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }, // UC Officer ID
  status: { 
    type: String, 
    enum: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RE_VERIFIED'], 
    default: 'ASSIGNED' 
  },
  checklist: { 
    type: [String], 
    default: [] 
  },
  completionProofPhoto: { 
    type: String 
  },
  deadline: { 
    type: Date 
  },

  // ── Cost & Budget linkage ──────────────────────────────────────────────────
  estimatedCost: {
    type: Number,
    default: 0,
    min: 0,
  },

  // ── Re-Verification fields ─────────────────────────────────────────────────
  reVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reVerifiedAt: {
    type: Date,
    default: null,
  },
  inspectionNotes: {
    type: String,
    maxlength: 1000,
    default: null,
  },
  inspectionRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
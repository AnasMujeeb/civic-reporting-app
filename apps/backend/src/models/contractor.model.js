const mongoose = require('mongoose');

const contractorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  phone: { 
    type: String, 
    required: true, 
    unique: true 
  },
  category: { 
    type: String, 
    required: true, 
    enum: ['ROAD_REPAIR', 'SANITATION', 'STREET_LIGHTS', 'DRAINAGE', 'GENERAL'] 
  },
  rating: { 
    type: Number, 
    default: 5.0, 
    min: 1.0, 
    max: 5.0 
  },
  completedJobsCount: { 
    type: Number, 
    default: 0 
  },
  isBlacklisted: { 
    type: Boolean, 
    default: false 
  },
  blacklistedReason: { 
    type: String 
  }
}, { timestamps: true });

module.exports = mongoose.model('Contractor', contractorSchema);
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      required: true,
      set: function(val) {
        if (!val) return 'OTHER';
        const formatted = String(val).trim().toUpperCase().replace(/\s+/g, '_');
        const map = {
          'POTHOLE': 'ROAD_REPAIR',
          'ROAD_REPAIR': 'ROAD_REPAIR',
          'GARBAGE': 'SANITATION',
          'SANITATION': 'SANITATION',
          'STREETLIGHT': 'STREET_LIGHTS',
          'STREET_LIGHT': 'STREET_LIGHTS',
          'STREET_LIGHTS': 'STREET_LIGHTS',
          'SEWAGE': 'DRAINAGE',
          'DRAINAGE': 'DRAINAGE',
          'WATER_LEAK': 'WATER_SUPPLY',
          'WATER_LEAKAGE': 'WATER_SUPPLY',
          'WATER_SUPPLY': 'WATER_SUPPLY',
          'OTHER': 'OTHER',
          'GENERAL': 'OTHER',
        };
        return map[formatted] || formatted;
      },
      enum: [
        'ROAD_REPAIR', 'SANITATION', 'STREET_LIGHTS', 'DRAINAGE', 'WATER_SUPPLY', 'OTHER',
        'POTHOLE', 'GARBAGE', 'STREETLIGHT', 'STREET_LIGHT', 'SEWAGE', 'WATER_LEAK', 'WATER_LEAKAGE',
        'Pothole', 'Garbage', 'Streetlight', 'Sewage', 'Water Leak', 'Other', 'General'
      ],
    },
    imageUrl: { type: String, required: true },
    ucNumber: {
      type: String,
      required: [true, 'UC number is required'],
      trim: true,
      index: true,
    },
    district: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }
    },
    address: { type: String },
    isGpsVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['PENDING', 'REP_VERIFIED', 'IN_PROGRESS', 'FIXED', 'CLOSED'],
      default: 'PENDING'
    },
    comments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Perceptual Hash for duplicate image detection (anti-spam)
    pHash: { type: String, index: true },

    // Resolution Proof Fields
    resolvedImageUrl: { type: String },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  { timestamps: true }
);

reportSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Report', reportSchema);
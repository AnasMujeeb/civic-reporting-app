const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true, default: null },
  password: { type: String, required: true },
  name: { type: String, required: true },
  avatar: { type: String, default: null },
  role: { 
    type: String, 
    enum: ['CITIZEN', 'STREET_REP', 'CONTRACTOR', 'UC_OFFICER', 'MAYOR', 'ADMIN', 'OPS'], 
    default: 'CITIZEN' 
  },
  cnic:     { type: String },
  fcmToken: { type: String, default: null }, // Firebase Cloud Messaging device token
  isPhoneVerified: { type: Boolean, default: false },

  // Contractor profile link (populated when role === 'CONTRACTOR')
  contractorProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contractor',
    default: null,
  },

  // UC / Zone assignment (for STREET_REP and UC_OFFICER roles)
  ucNumber: { type: String, default: null },
  zone:     { type: String, default: null },
}, { timestamps: true });

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  // If password is already a valid bcrypt hash (e.g. from direct hashing), skip
  if (this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$'))) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Password comparison method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
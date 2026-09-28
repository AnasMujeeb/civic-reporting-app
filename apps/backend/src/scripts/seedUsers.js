/**
 * seedUsers.js — Seed default test admin users for the Digital Solo platform.
 *
 * Usage:
 *   node src/scripts/seedUsers.js
 *   npm run seed:users      (from apps/backend)
 *
 * This script upserts (creates or updates) two test admin accounts:
 *   1. Mayor   — mayor@karachi.gov.pk / AdminPassword123!
 *   2. Officer — officer@karachi.gov.pk / OfficerPassword123!
 *
 * It does NOT delete existing data; it uses findOneAndUpdate with upsert.
 */

const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables from backend root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/digital_karachi';

const seedUsers = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.\n');

    // Pre-hash passwords so the pre-save hook doesn't double-hash
    const salt = await bcrypt.genSalt(10);
    const mayorHash = await bcrypt.hash('AdminPassword123!', salt);
    const officerHash = await bcrypt.hash('OfficerPassword123!', salt);

    // ── 1. Mayor Account ────────────────────────────────────────────────────────
    const mayorData = {
      name: 'Mayor Karachi',
      phone: '+923001111111',
      email: 'mayor@karachi.gov.pk',
      password: mayorHash,
      role: 'MAYOR',
      zone: 'Karachi Central & East',
      ucNumber: 'CITY-WIDE',
      isPhoneVerified: true,
    };

    const mayor = await User.findOneAndUpdate(
      { $or: [{ email: 'mayor@karachi.gov.pk' }, { phone: '+923001111111' }] },
      { $set: mayorData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✅ Mayor account seeded:');
    console.log(`   Name:     ${mayor.name}`);
    console.log(`   Email:    ${mayor.email}`);
    console.log(`   Phone:    ${mayor.phone}`);
    console.log(`   Role:     ${mayor.role}`);
    console.log(`   Password: AdminPassword123!\n`);

    // ── 2. UC Officer Account ───────────────────────────────────────────────────
    const officerData = {
      name: 'UC Officer',
      phone: '+923003333333',
      email: 'officer@karachi.gov.pk',
      password: officerHash,
      role: 'UC_OFFICER',
      ucNumber: 'UC-01',
      zone: 'District East',
      isPhoneVerified: true,
    };

    const officer = await User.findOneAndUpdate(
      { $or: [{ email: 'officer@karachi.gov.pk' }, { phone: '+923003333333' }] },
      { $set: officerData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✅ UC Officer account seeded:');
    console.log(`   Name:     ${officer.name}`);
    console.log(`   Email:    ${officer.email}`);
    console.log(`   Phone:    ${officer.phone}`);
    console.log(`   Role:     ${officer.role}`);
    console.log(`   UC ID:    ${officer.ucNumber}`);
    console.log(`   Password: OfficerPassword123!\n`);

    console.log('━'.repeat(55));
    console.log('✨ Admin user seeding complete!');
    console.log('');
    console.log('  You can now log in to the Web Admin Portal with:');
    console.log('');
    console.log('  Mayor Login:');
    console.log('    Email:    mayor@karachi.gov.pk');
    console.log('    Password: AdminPassword123!');
    console.log('');
    console.log('  Officer Login:');
    console.log('    Email:    officer@karachi.gov.pk');
    console.log('    Password: OfficerPassword123!');
    console.log('━'.repeat(55));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedUsers();

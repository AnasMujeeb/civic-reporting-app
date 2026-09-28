const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Contractor = require('../models/contractor.model');
const Report = require('../models/Report');
const WorkOrder = require('../models/workOrder.model');
const Budget = require('../models/Budget');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/digital_karachi';

const seedDatabase = async () => {
  try {
    console.log('🔄 Connecting to MongoDB for seeding...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully.');

    // ── 1. Clear Existing Collections ──────────────────────────────────────────
    console.log('🧹 Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Contractor.deleteMany({}),
      Report.deleteMany({}),
      WorkOrder.deleteMany({}),
      Budget.deleteMany({}),
    ]);
    console.log('✅ Existing collections cleared.');

    // ── 2. Seed Pre-configured Test Users ──────────────────────────────────────
    console.log('🌱 Seeding pre-configured test users...');

    // 1. Mayor / Ops
    const mayorUser = await User.create({
      name: 'Murtaza Wahab',
      phone: '+923001111111',
      password: 'password123',
      role: 'MAYOR',
      zone: 'Karachi Central & East',
      ucNumber: 'CITY-WIDE',
    });

    // 2. Citizen
    const citizenUser = await User.create({
      name: 'Qazi Anas',
      phone: '+923002222222',
      password: 'password123',
      role: 'CITIZEN',
      zone: 'District East',
      ucNumber: 'UC-01',
    });

    // 3. UC Officer
    const officerUser = await User.create({
      name: 'Ali Ahmed',
      phone: '+923003333333',
      password: 'password123',
      role: 'UC_OFFICER',
      ucNumber: 'UC-01',
      zone: 'District East',
    });

    // 4. Contractor User + Linked Contractor Document
    const contractorUser = await User.create({
      name: 'Qazi Asad',
      phone: '+923004444444',
      password: 'password123',
      role: 'CONTRACTOR',
      zone: 'District East',
      ucNumber: 'UC-01',
    });

    const contractorDoc = await Contractor.create({
      userId: contractorUser._id,
      name: 'Qazi Asad Services & Construction',
      phone: '+923004444444',
      category: 'ROAD_REPAIR',
      rating: 4.8,
      completedJobsCount: 14,
      isBlacklisted: false,
    });

    // Link contractorProfile back to User
    contractorUser.contractorProfile = contractorDoc._id;
    await contractorUser.save();

    console.log('✅ Test users & contractor profile seeded:');
    console.log(`   - Mayor: ${mayorUser.name} (${mayorUser.phone}) [role: ${mayorUser.role}]`);
    console.log(`   - Citizen: ${citizenUser.name} (${citizenUser.phone}) [role: ${citizenUser.role}]`);
    console.log(`   - UC Officer: ${officerUser.name} (${officerUser.phone}) [UC: ${officerUser.ucNumber}]`);
    console.log(`   - Contractor: ${contractorDoc.name} (${contractorDoc.phone}) [category: ${contractorDoc.category}]`);

    // ── 3. Seed Pilot Union Councils & Budgets ─────────────────────────────────
    console.log('🌱 Seeding pilot Union Councils & allocated budgets...');
    const pilotUCs = [
      {
        ucId: 'UC-01',
        category: 'ROAD_REPAIR',
        allocatedAmount: 5000000,
        spentAmount: 1250000,
        description: 'UC-01 Road resurfacing and pothole patching allocation pool',
        approvedBy: mayorUser._id,
      },
      {
        ucId: 'UC-04',
        category: 'DRAINAGE',
        allocatedAmount: 5000000,
        spentAmount: 850000,
        description: 'UC-04 Gulshan-e-Iqbal monsoon nullah & drainage maintenance',
        approvedBy: mayorUser._id,
      },
      {
        ucId: 'UC-07',
        category: 'SANITATION',
        allocatedAmount: 5000000,
        spentAmount: 420000,
        description: 'UC-07 North Nazimabad solid waste management & dumpster units',
        approvedBy: mayorUser._id,
      },
      {
        ucId: 'UC-11',
        category: 'STREET_LIGHTS',
        allocatedAmount: 5000000,
        spentAmount: 1100000,
        description: 'UC-11 Civil Lines / Clifton solar street lighting project',
        approvedBy: mayorUser._id,
      },
      {
        ucId: 'UC-14',
        category: 'WATER_SUPPLY',
        allocatedAmount: 5000000,
        spentAmount: 950000,
        description: 'UC-14 Korangi industrial water line pressure stabilization',
        approvedBy: mayorUser._id,
      },
    ];

    const seededBudgets = await Budget.insertMany(pilotUCs);
    console.log(`✅ ${seededBudgets.length} UC budget allocations created (5,000,000 PKR each).`);

    // ── 4. Seed Sample Municipal Reports & Work Orders ─────────────────────────
    console.log('🌱 Seeding sample municipal reports...');

    // Report 1: UC-01 - PENDING (Submitted)
    const report1 = await Report.create({
      title: 'Large Dangerous Pothole near Baloch Colony Flyover',
      description: 'Severe 3-foot deep pothole causing vehicle axle damage and bottleneck traffic.',
      category: 'ROAD_REPAIR',
      ucNumber: 'UC-01',
      district: 'District East',
      address: 'Shahrah-e-Faisal near Baloch Colony Flyover, Karachi',
      location: {
        type: 'Point',
        coordinates: [67.0738, 24.8615], // [lng, lat]
      },
      isGpsVerified: true,
      imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800',
      status: 'PENDING',
      createdBy: citizenUser._id,
    });

    // Report 2: UC-01 - REP_VERIFIED (Verified by Street Rep / Officer)
    const report2 = await Report.create({
      title: 'Broken Main Water Pipe Flooding Residential Street',
      description: 'Potable water pipeline rupture resulting in massive water wastage and flooded sidewalks.',
      category: 'WATER_SUPPLY',
      ucNumber: 'UC-01',
      district: 'District East',
      address: 'PECHS Block 6, Street 12, Karachi',
      location: {
        type: 'Point',
        coordinates: [67.0652, 24.8681], // [lng, lat]
      },
      isGpsVerified: true,
      imageUrl: 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?w=800',
      status: 'REP_VERIFIED',
      createdBy: citizenUser._id,
    });

    // Report 3: UC-04 - IN_PROGRESS (Work order assigned to contractor)
    const report3 = await Report.create({
      title: 'Overflowing Sewage Gutter near Commercial Market',
      description: 'Severely choked sewer line leaking contaminated black water into shop fronts.',
      category: 'DRAINAGE',
      ucNumber: 'UC-04',
      district: 'District East',
      address: 'Gulshan-e-Iqbal Block 4, Main Commercial Avenue, Karachi',
      location: {
        type: 'Point',
        coordinates: [67.0982, 24.9180], // [lng, lat]
      },
      isGpsVerified: true,
      imageUrl: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800',
      status: 'IN_PROGRESS',
      createdBy: citizenUser._id,
    });

    // Create linked WorkOrder for Report 3
    const workOrder3 = await WorkOrder.create({
      reportId: report3._id,
      contractorId: contractorDoc._id,
      assignedBy: officerUser._id,
      status: 'IN_PROGRESS',
      checklist: [
        'Inspect underground sewer blockage with camera probe',
        'Jet-vacuum silt and solid blockages',
        'Replace damaged manhole chamber cover',
        'Disinfect street surface with chlorine spray',
      ],
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      estimatedCost: 350000,
    });

    // Report 4: UC-04 - FIXED (Resolved with proof photo)
    const report4 = await Report.create({
      title: 'Defective LED Streetlights on Main University Road',
      description: 'A cluster of 8 solar streetlights were inactive, causing security hazard at night.',
      category: 'STREET_LIGHTS',
      ucNumber: 'UC-04',
      district: 'District East',
      address: 'University Road near Civic Centre, Karachi',
      location: {
        type: 'Point',
        coordinates: [67.0722, 24.8933], // [lng, lat]
      },
      isGpsVerified: true,
      imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800',
      status: 'FIXED',
      resolvedImageUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800',
      resolvedAt: new Date(),
      resolvedBy: officerUser._id,
      createdBy: citizenUser._id,
    });

    console.log('✅ Sample municipal reports & work orders created:');
    console.log(`   1. [PENDING]       ${report1.title} (${report1.ucNumber})`);
    console.log(`   2. [REP_VERIFIED]  ${report2.title} (${report2.ucNumber})`);
    console.log(`   3. [IN_PROGRESS]   ${report3.title} (${report3.ucNumber}) -> WorkOrder: ${workOrder3._id}`);
    console.log(`   4. [FIXED]         ${report4.title} (${report4.ucNumber})`);

    console.log('\n✨ Karachi Pilot Database successfully initialized and seeded! ✨');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedDatabase();

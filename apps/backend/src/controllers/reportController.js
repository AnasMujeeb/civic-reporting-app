const Report = require('../models/Report');
const WorkOrder = require('../models/workOrder.model');
const Contractor = require('../models/contractor.model');
const { extractExifData } = require('../utils/exifHelper');
const { uploadImage } = require('../utils/cloudinaryHelper');
const { generatePHash, hammingDistance } = require('../utils/phashHelper');
const { validateKarachiBounds } = require('../utils/geofenceHelper');
const {
  dispatchReportStatusNotification,
} = require('../queues/notificationQueue');

// ── Status Transition State Machine ──────────────────────────────────────────
const STATUS_TRANSITIONS = {
  PENDING:      { REP_VERIFIED: ['STREET_REP', 'UC_OFFICER', 'ADMIN', 'MAYOR'], CLOSED: ['STREET_REP', 'UC_OFFICER', 'ADMIN', 'MAYOR'] },
  REP_VERIFIED: { IN_PROGRESS:  ['UC_OFFICER', 'STREET_REP', 'ADMIN', 'MAYOR'], CLOSED: ['STREET_REP', 'UC_OFFICER', 'ADMIN', 'MAYOR'] },
  IN_PROGRESS:  { FIXED:        ['CONTRACTOR', 'UC_OFFICER', 'STREET_REP', 'ADMIN', 'MAYOR'], REP_VERIFIED: ['STREET_REP', 'UC_OFFICER', 'ADMIN', 'MAYOR'] },
  FIXED:        { CLOSED:       ['STREET_REP', 'UC_OFFICER', 'ADMIN', 'MAYOR'], IN_PROGRESS: ['STREET_REP', 'UC_OFFICER', 'ADMIN', 'MAYOR'] },
};

// Hamming distance threshold — images with distance <= this are considered duplicates
const PHASH_DUPLICATE_THRESHOLD = 10;

// ─── 1. Create New Report ────────────────────────────────────────────────────
exports.createReport = async (req, res, next) => {
  try {
    const { title, description, category, address, longitude, latitude, ucNumber, district } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file of the issue' });
    }

    // ── EXIF extraction + freshness validation ────────────────────────────
    const exif = extractExifData(req.file.buffer);

    let finalLat = parseFloat(latitude);
    let finalLng = parseFloat(longitude);
    let isGpsVerified = false;

    if (exif.hasGps) {
      finalLat = exif.latitude;
      finalLng = exif.longitude;
      isGpsVerified = true;
      console.log('GPS verified directly from Image EXIF metadata!');
    } else {
      console.log('No EXIF GPS found in image (fallback to device/manual coordinates).');
    }

    // ── EXIF freshness check — reject stale or future-dated photos ───────
    if (exif.isFresh === false) {
      return res.status(400).json({
        success: false,
        message: `Photo freshness check failed: ${exif.freshnessMsg}`,
      });
    }

    if (isNaN(finalLat) || isNaN(finalLng)) {
      return res.status(400).json({ 
        success: false,
        message: 'Could not detect GPS location from image or manual coordinates.' 
      });
    }

    // ── Karachi geofence boundary check ──────────────────────────────────
    const geoCheck = validateKarachiBounds(finalLat, finalLng);
    if (!geoCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: geoCheck.message,
      });
    }

    // ── Perceptual hash — duplicate image detection ──────────────────────
    let pHash = null;
    try {
      pHash = await generatePHash(req.file.buffer);

      // Check for near-identical images submitted in the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentReports = await Report.find({
        pHash: { $ne: null },
        createdAt: { $gte: twentyFourHoursAgo },
      }).select('pHash title _id');

      for (const existing of recentReports) {
        const distance = hammingDistance(pHash, existing.pHash);
        if (distance <= PHASH_DUPLICATE_THRESHOLD) {
          return res.status(409).json({
            success: false,
            message: 'Duplicate image detected! A report with a near-identical photo was submitted in the last 24 hours.',
            duplicateOf: existing._id,
          });
        }
      }
    } catch (hashErr) {
      // pHash generation is non-critical — log and continue without blocking
      console.error('[pHash] Generation failed (non-blocking):', hashErr.message);
    }

    // ── Upload image (Cloudinary → local fallback) ────────────────────────
    const uploadResult = await uploadImage(
      req.file.buffer,
      'digital_karachi/reports',
      req.file.originalname
    );
    const imageUrl = uploadResult.secure_url;
    if (uploadResult.storage === 'local') {
      console.log('[Report] Image stored locally (Cloudinary unavailable).');
    }

    const report = await Report.create({
      title,
      description,
      category,
      imageUrl,
      pHash,
      location: {
        type: 'Point',
        coordinates: [finalLng, finalLat]
      },
      address,
      ucNumber: req.body.ucNumber ? String(req.body.ucNumber).trim() : 'UC-01',
      district: req.body.district ? String(req.body.district).trim() : 'District East',
      isGpsVerified,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: isGpsVerified 
        ? 'Report created with verified image GPS!' 
        : 'Report created using manual GPS.',
      isGpsVerified,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. Get All Reports (Paginated + Filtered) ──────────────────────────────
exports.getAllReports = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // ── Build filter object from query params ─────────────────────────────
    const filter = {};

    if (req.query.status) {
      if (req.query.status.includes(',')) {
        const statuses = req.query.status.split(',').map((s) => s.trim()).filter(Boolean);
        filter.status = { $in: statuses };
      } else {
        filter.status = req.query.status;
      }
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.ucNumber) filter.ucNumber = req.query.ucNumber;
    if (req.query.district) filter.district = req.query.district;

    // Date range filter on createdAt
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate)   filter.createdAt.$lte = new Date(req.query.endDate);
    }

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('createdBy', 'name phone role')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: reports,
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

// ─── 3. Get Nearby Reports (Spatial Search) ──────────────────────────────────
exports.getNearbyReports = async (req, res, next) => {
  try {
    const { longitude, latitude, radius } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide longitude and latitude in query params' 
      });
    }

    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);

    const parsedRadius = parseFloat(radius);
    const radiusInKm = !isNaN(parsedRadius) ? parsedRadius : 5;
    const maxDistanceInMeters = radiusInKm * 1000;

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({ success: false, message: 'Longitude and Latitude must be valid numbers' });
    }

    // GeoJSON Spatial Query ($near)
    const reports = await Report.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: maxDistanceInMeters
        }
      }
    }).populate('createdBy', 'name phone role');

    res.status(200).json({
      success: true,
      count: reports.length,
      searchRadiusKm: radiusInKm,
      data: reports
    });
  } catch (error) {
    next(error);
  }
};

// ─── 4. Update Report Status (State Machine + Role Guard) ────────────────────
exports.updateReportStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    // ── Fetch current report to determine its existing status ──────────────
    const report = await Report.findById(id).populate('createdBy', 'name phone fcmToken');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const currentStatus = report.status;

    // ── State machine: validate transition is allowed ─────────────────────
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions || !allowedTransitions[newStatus]) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition: ${currentStatus} → ${newStatus}. `
               + `Allowed transitions from ${currentStatus}: ${Object.keys(allowedTransitions || {}).join(', ') || 'none (terminal state)'}`,
      });
    }

    // ── Role guard: verify the user has permission for this transition ────
    const allowedRoles = allowedTransitions[newStatus];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized for transition ${currentStatus} → ${newStatus}. `
               + `Required role(s): ${allowedRoles.join(', ')}`,
      });
    }

    // ── Apply the transition ──────────────────────────────────────────────
    const updatedReport = await Report.findByIdAndUpdate(
      id,
      { status: newStatus },
      { new: true, runValidators: false }
    ).populate('createdBy', 'name phone fcmToken');

    // ── Fire-and-forget background notification ──────────────────────────
    dispatchReportStatusNotification({ report: updatedReport, newStatus }).catch((err) =>
      console.error('[Notification] Failed to dispatch status change job:', err.message)
    );

    res.status(200).json({
      success: true,
      message: `Report status updated: ${currentStatus} → ${newStatus}`,
      data: updatedReport,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 5. Upvote / Toggle Upvote Report ───────────────────────────────────────
exports.upvoteReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const report = await Report.findById(id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const hasUpvoted = report.upvotes.some(
      (upvoteId) => upvoteId.toString() === userId.toString()
    );

    if (hasUpvoted) {
      report.upvotes = report.upvotes.filter(
        (upvoteId) => upvoteId.toString() !== userId.toString()
      );
    } else {
      report.upvotes.push(userId);
    }

    await report.save();

    res.status(200).json({
      success: true,
      message: hasUpvoted ? 'Upvote removed' : 'Report upvoted successfully',
      totalUpvotes: report.upvotes.length,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

// ─── 6. Get My Reports (Logged-in User's Reports) ───────────────────────────
exports.getMyReports = async (req, res, next) => {
  try {
    const reports = await Report.find({ createdBy: req.user._id })
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    next(error);
  }
};

// ─── 7. Resolve Report with Proof Image (UC Officer / Admin / Contractor) ────
exports.resolveReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { executionNotes, notes } = req.body;

    const afterFile = req.files?.afterImage?.[0] || req.files?.image?.[0] || req.file;
    const beforeFile = req.files?.beforeImage?.[0];

    if (!afterFile && !beforeFile) {
      return res.status(400).json({ 
        success: false,
        message: 'Please upload at least a proof image showing the fixed issue.' 
      });
    }

    // Populate creator so notification dispatcher gets FCM token + phone
    const report = await Report.findById(id).populate('createdBy', 'name phone fcmToken');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (report.status === 'FIXED') {
      return res.status(400).json({ success: false, message: 'This report is already marked as FIXED.' });
    }

    let afterUploadUrl = null;
    let beforeUploadUrl = null;

    if (afterFile) {
      const uploadResult = await uploadImage(
        afterFile.buffer,
        'digital_karachi/resolve_proofs',
        afterFile.originalname
      );
      afterUploadUrl = uploadResult.secure_url;
    }

    if (beforeFile) {
      const uploadBeforeResult = await uploadImage(
        beforeFile.buffer,
        'digital_karachi/resolve_proofs',
        beforeFile.originalname
      );
      beforeUploadUrl = uploadBeforeResult.secure_url;
    }

    report.status = 'FIXED';
    report.resolvedImageUrl = afterUploadUrl || report.resolvedImageUrl;
    report.resolvedAt = Date.now();
    report.resolvedBy = req.user._id;

    // Append resolution notes as a comment if provided
    const commentText = executionNotes || notes;
    if (commentText || beforeUploadUrl) {
      const parts = [];
      if (commentText) parts.push(`🛠️ Contractor Resolution Notes: ${commentText}`);
      if (beforeUploadUrl) parts.push(`📷 Before Work Evidence: ${beforeUploadUrl}`);
      report.comments.push({
        user: req.user._id,
        text: parts.join('\n'),
        createdAt: new Date(),
      });
    }

    await report.save();

    // ── Update linked WorkOrder if exists ──────────────────────────────────
    try {
      const linkedWorkOrder = await WorkOrder.findOne({
        reportId: report._id,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
      });

      if (linkedWorkOrder) {
        linkedWorkOrder.status = 'COMPLETED';
        if (afterUploadUrl) {
          linkedWorkOrder.completionProofPhoto = afterUploadUrl;
        }
        if (commentText) {
          linkedWorkOrder.inspectionNotes = commentText;
        }
        await linkedWorkOrder.save();

        if (linkedWorkOrder.contractorId) {
          await Contractor.findByIdAndUpdate(linkedWorkOrder.contractorId, {
            $inc: { completedJobsCount: 1 },
          });
        }
      }
    } catch (woErr) {
      console.warn('[resolveReport] Linked work order update warning:', woErr.message);
    }

    // ── Fire-and-forget FIXED notification to the report creator ─────────
    dispatchReportStatusNotification({ report, newStatus: 'FIXED' }).catch((err) =>
      console.error('[Notification] Failed to dispatch resolve job:', err.message)
    );

    res.status(200).json({
      success: true,
      message: 'Report has been successfully marked as FIXED with resolution proof!',
      data: report,
      beforeImageUrl: beforeUploadUrl,
      afterImageUrl: afterUploadUrl,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 8. Get Report Statistics (Admin / UC Officer / Street Rep) ─────────────
exports.getReportStats = async (req, res, next) => {
  try {
    const stats = await Report.aggregate([
      {
        $facet: {
          totalCount: [
            { $count: 'count' }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ]
        }
      }
    ]);

    const total = stats[0].totalCount[0] ? stats[0].totalCount[0].count : 0;

    res.status(200).json({
      success: true,
      totalReports: total,
      byStatus: stats[0].byStatus,
      byCategory: stats[0].byCategory
    });
  } catch (error) {
    next(error);
  }
};

// ─── 9. Get Single Report Detail By ID ──────────────────────────────────────
exports.getReportById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const report = await Report.findById(id)
      .populate('createdBy', 'name phone role')
      .populate('resolvedBy', 'name phone role')
      .populate('comments.user', 'name role');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

// ─── 10. Add Comment to Report ──────────────────────────────────────────────
exports.addComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const report = await Report.findById(id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const newComment = {
      user: req.user._id,
      text: text.trim()
    };

    report.comments.push(newComment);
    await report.save();

    // Populate user info for the response
    await report.populate('comments.user', 'name role');

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: report
    });
  } catch (error) {
    next(error);
  }
};

// ─── 9. Escalate Report (Mayor / OPS Quick Action Override) ─────────────────
exports.escalateReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, priority = 'URGENT', targetContractorId, notes } = req.body;

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const escalationDirective = reason || notes || 'Executive Escalation: Immediate resolution mandated by Mayor Office.';
    
    report.priority = priority || 'URGENT';
    report.comments.push({
      user: req.user._id,
      text: `⚡ MAYOR DIRECTIVE (${priority}): ${escalationDirective}`,
      createdAt: new Date(),
    });

    await report.save();

    // If contractor specified or existing work order exists, update work order
    if (targetContractorId) {
      const existingWO = await WorkOrder.findOne({ reportId: report._id });
      if (existingWO) {
        existingWO.contractorId = targetContractorId;
        existingWO.priority = priority;
        existingWO.inspectionNotes = `Reassigned by Mayor: ${escalationDirective}`;
        await existingWO.save();
      } else {
        await WorkOrder.create({
          reportId: report._id,
          contractorId: targetContractorId,
          assignedBy: req.user._id,
          priority,
          checklist: ['Emergency resolution dispatched by Mayor Command Center'],
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Report successfully escalated with high-priority executive directive.',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 10. Close Report (Officer / Admin / Mayor final sign-off) ──────────────
exports.closeReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const report = await Report.findById(id).populate('createdBy', 'name phone fcmToken');
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    report.status = 'CLOSED';
    if (notes) {
      report.comments.push({
        user: req.user._id,
        text: `🏁 Case Closed & Approved by ${req.user.role}: ${notes}`,
        createdAt: new Date(),
      });
    }
    await report.save();

    // Re-verify and close any linked work orders
    await WorkOrder.updateMany(
      { reportId: report._id, status: { $ne: 'RE_VERIFIED' } },
      { status: 'RE_VERIFIED', inspectionNotes: notes || 'Approved & closed by Officer' }
    );

    dispatchReportStatusNotification({ report, newStatus: 'CLOSED' }).catch((err) =>
      console.error('[Notification] Failed to dispatch close job:', err.message)
    );

    res.status(200).json({
      success: true,
      message: 'Report approved and marked as CLOSED.',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};
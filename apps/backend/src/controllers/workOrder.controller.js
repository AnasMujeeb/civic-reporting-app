const WorkOrder  = require('../models/workOrder.model');
const Report     = require('../models/Report');
const Contractor = require('../models/contractor.model');
const Budget     = require('../models/Budget');
const { uploadImage }        = require('../utils/cloudinaryHelper');
const { extractExifData }    = require('../utils/exifHelper');
const { logAudit }           = require('../middlewares/auditLogger');
const {
  dispatchNotification,
  dispatchWorkOrderNotification,
} = require('../queues/notificationQueue');

// ─── 1. UC Officer assigns a work order to a contractor ──────────────────────
exports.createWorkOrder = async (req, res, next) => {
  try {
    const { reportId, contractorId, checklist, deadline, estimatedCost } = req.body;

    // Validate references exist
    const [report, contractor] = await Promise.all([
      Report.findById(reportId).populate('createdBy', 'name phone fcmToken'),
      Contractor.findById(contractorId),
    ]);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    if (!contractor) {
      return res.status(404).json({ success: false, message: 'Contractor not found' });
    }
    if (contractor.isBlacklisted) {
      return res.status(400).json({
        success: false,
        message: `Contractor "${contractor.name}" is blacklisted and cannot be assigned work.`,
      });
    }

    const workOrder = await WorkOrder.create({
      reportId,
      contractorId,
      assignedBy:    req.user._id,
      checklist:     checklist     || [],
      deadline:      deadline      || undefined,
      estimatedCost: estimatedCost || 0,
    });

    // ── Update report status to IN_PROGRESS ───────────────────────────────────
    await Report.findByIdAndUpdate(reportId, { status: 'IN_PROGRESS' });

    // ── Audit log ─────────────────────────────────────────────────────────────
    logAudit({
      actor:       req.user._id,
      action:      'WORK_ORDER_CREATED',
      targetModel: 'WorkOrder',
      targetId:    workOrder._id,
      changes:     { before: null, after: { reportId, contractorId, status: 'ASSIGNED' } },
      ipAddress:   req.ip,
      description: `Work order created for report "${report.title}" assigned to ${contractor.name}`,
    });

    // ── Fire-and-forget notifications ─────────────────────────────────────────
    dispatchWorkOrderNotification({ workOrder, contractor, report }).catch((err) =>
      console.error('[Notification] Work order dispatch failed:', err.message)
    );
    if (report.createdBy) {
      dispatchNotification({
        recipientId:       report.createdBy._id.toString(),
        recipientFcmToken: report.createdBy.fcmToken || null,
        recipientPhone:    report.createdBy.phone    || null,
        type:  'WORK_ORDER_ASSIGNED',
        title: '🔧 Work Started on Your Report',
        body:  `A contractor (${contractor.name}) has been assigned to fix: "${report.title}".`,
        data:  { reportId: report._id, workOrderId: workOrder._id },
      }).catch((err) =>
        console.error('[Notification] Citizen work-order dispatch failed:', err.message)
      );
    }

    res.status(201).json({
      success: true,
      message: 'Work order created and report status updated to IN_PROGRESS.',
      data: workOrder,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. Contractor updates work order status / uploads completion proof ──────
exports.updateWorkOrderStatus = async (req, res, next) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const validStatuses = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RE_VERIFIED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${validStatuses.join(', ')}`,
      });
    }

    // ── Fetch existing work order to verify existence and authorization ───
    const existingWorkOrder = await WorkOrder.findById(id).populate('contractorId');
    if (!existingWorkOrder) {
      return res.status(404).json({ success: false, message: 'Work order not found' });
    }

    // ── Enforce strict authorization for completion proof / COMPLETED status ──
    if (status === 'COMPLETED' || req.file) {
      if (req.user.role !== 'CONTRACTOR') {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Only assigned contractors can upload completion proof and mark status as COMPLETED.',
        });
      }

      const assignedContractor = existingWorkOrder.contractorId;
      const isAssigned = assignedContractor && (
        assignedContractor._id?.toString() === req.user._id.toString() ||
        assignedContractor.userId?.toString() === req.user._id.toString() ||
        assignedContractor.phone === req.user.phone
      );

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not the assigned contractor for this work order.',
        });
      }
    }

    const updateFields = { status };

    // If contractor is uploading a completion proof photo
    if (req.file) {
      // ── EXIF freshness check on completion proof ────────────────────────
      const exif = extractExifData(req.file.buffer);
      if (exif.isFresh === false) {
        return res.status(400).json({
          success: false,
          message: `Completion proof photo rejected: ${exif.freshnessMsg}`,
        });
      }

      const uploadResult = await uploadImage(
        req.file.buffer,
        'digital_karachi/work_order_proofs',
        req.file.originalname
      );
      updateFields.completionProofPhoto = uploadResult.secure_url;
    }

    const workOrder = await WorkOrder.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('reportId', 'title createdBy location')
      .populate('contractorId', 'name')
      .populate('assignedBy', 'name phone fcmToken');

    // ── If COMPLETED, update the linked report to FIXED ───────────────────────
    if (status === 'COMPLETED' && workOrder.reportId) {
      await Report.findByIdAndUpdate(workOrder.reportId._id, { status: 'FIXED' });
      
      if (workOrder.contractorId) {
        await Contractor.findByIdAndUpdate(workOrder.contractorId._id, {
          $inc: { completedJobsCount: 1 },
        });
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    logAudit({
      actor:       req.user._id,
      action:      'WORK_ORDER_STATUS_CHANGE',
      targetModel: 'WorkOrder',
      targetId:    workOrder._id,
      changes:     { before: null, after: { status } },
      ipAddress:   req.ip,
      description: `Work order status updated to ${status}`,
    });

    // ── Fire-and-forget: notify the UC Officer who assigned this work ──────────
    if (workOrder.assignedBy) {
      const assignedById = workOrder.assignedBy._id || workOrder.assignedBy;
      dispatchNotification({
        recipientId:       assignedById.toString(),
        recipientFcmToken: workOrder.assignedBy.fcmToken || null,
        recipientPhone:    workOrder.assignedBy.phone    || null,
        type:  'WORK_ORDER_UPDATED',
        title: `📋 Work Order ${status}`,
        body:  `Contractor "${workOrder.contractorId?.name || 'Assigned'}" updated the work order status to ${status}.`,
        data:  { workOrderId: workOrder._id, reportId: workOrder.reportId?._id },
      }).catch((err) =>
        console.error('[Notification] Work order update dispatch failed:', err.message)
      );
    }

    res.status(200).json({
      success: true,
      data: workOrder,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 3. Street Rep Re-Verification of completed work ────────────────────────
// ─── 3. Street Rep Re-Verification of completed work ────────────────────────
exports.reVerifyWorkOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { inspectionNotes, inspectionRating } = req.body;

    const workOrder = await WorkOrder.findById(id)
      .populate('reportId', 'title category createdBy')
      .populate('contractorId', 'name _id');

    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Work order not found' });
    }

    if (workOrder.status !== 'COMPLETED' && workOrder.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        message: `Cannot re-verify a work order with status "${workOrder.status}".`,
      });
    }

    // ── Apply re-verification: set WorkOrder to COMPLETED & Report to FIXED ──
    workOrder.status           = 'COMPLETED';
    workOrder.reVerifiedBy     = req.user._id;
    workOrder.reVerifiedAt     = new Date();
    workOrder.inspectionNotes  = inspectionNotes  || null;
    workOrder.inspectionRating = inspectionRating  || null;
    await workOrder.save();

    // ── Update linked report to FIXED ────────────────────────────────────
    if (workOrder.reportId) {
      await Report.findByIdAndUpdate(workOrder.reportId._id, { status: 'FIXED' });
    }

    // ── Update contractor rating with inspection rating ───────────────────
    if (inspectionRating && workOrder.contractorId) {
      const contractor = await Contractor.findById(workOrder.contractorId._id);
      if (contractor) {
        // Weighted average: blend existing rating with new inspection rating
        const totalJobs = contractor.completedJobsCount || 1;
        const newRating = ((contractor.rating * (totalJobs - 1)) + inspectionRating) / totalJobs;
        contractor.rating = Math.round(newRating * 10) / 10; // round to 1 decimal
        await contractor.save();
      }
    }

    // ── Auto-deduct estimated cost from UC Budget ─────────────────────────
    if (workOrder.estimatedCost > 0) {
      // Find the most recent budget allocation for this work order's category/UC
      const report = workOrder.reportId;
      if (report) {
        await Budget.findOneAndUpdate(
          { workOrderId: workOrder._id },
          { $inc: { spentAmount: workOrder.estimatedCost } },
          { new: true }
        );
        // Also try to update the general UC budget if no direct link exists
        if (!(await Budget.findOne({ workOrderId: workOrder._id }))) {
          await Budget.findOneAndUpdate(
            { category: report.category },
            { $inc: { spentAmount: workOrder.estimatedCost } },
            { sort: { createdAt: -1 }, new: true }
          );
        }
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    logAudit({
      actor:       req.user._id,
      action:      'WORK_ORDER_RE_VERIFIED',
      targetModel: 'WorkOrder',
      targetId:    workOrder._id,
      changes:     {
        before: { status: 'COMPLETED' },
        after:  { status: 'COMPLETED', inspectionRating, inspectionNotes },
      },
      ipAddress:   req.ip,
      description: `Work order re-verified by Street Rep. Rating: ${inspectionRating || 'N/A'}. Report marked as FIXED.`,
    });

    res.status(200).json({
      success: true,
      message: 'Work order re-verified, report marked FIXED, and budget updated.',
      data: workOrder,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 4. Get all work orders for a specific contractor ────────────────────────
exports.getContractorWorkOrders = async (req, res, next) => {
  try {
    const { contractorId } = req.params;
    const { status }       = req.query;

    const ids = [];
    const isExplicitId = contractorId && contractorId !== 'me' && contractorId !== 'null' && contractorId !== 'undefined';
    
    if (isExplicitId) {
      ids.push(contractorId);
    }

    const orClauses = [];
    if (isExplicitId) {
      orClauses.push({ _id: contractorId }, { userId: contractorId });
    }
    if (req.user?.phone) {
      orClauses.push({ phone: req.user.phone });
    }
    if (req.user?._id) {
      orClauses.push({ userId: req.user._id }, { _id: req.user._id });
    }

    const contractorDoc = orClauses.length > 0
      ? await Contractor.findOne({ $or: orClauses })
      : null;

    if (contractorDoc) {
      ids.push(contractorDoc._id);
      if (contractorDoc.userId) ids.push(contractorDoc.userId);
    }
    if (req.user?._id) {
      ids.push(req.user._id);
    }

    const uniqueIds = [...new Set(ids.filter(Boolean))];
    const filter = uniqueIds.length > 0 ? { contractorId: { $in: uniqueIds } } : {};
    if (status) {
      if (status === 'COMPLETED') {
        filter.status = { $in: ['COMPLETED', 'RE_VERIFIED'] };
      } else {
        filter.status = status;
      }
    }

    const workOrders = await WorkOrder
      .find(filter)
      .populate('reportId', 'title category status location address imageUrl ucNumber district')
      .populate('contractorId', 'name phone category rating userId')
      .populate('assignedBy', 'name phone role')
      .populate('reVerifiedBy', 'name phone role')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: workOrders.length,
      data: workOrders,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 5. Get single work order by ID ─────────────────────────────────────────
exports.getWorkOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const workOrder = await WorkOrder
      .findById(id)
      .populate('reportId', 'title category status location address imageUrl ucNumber district')
      .populate('contractorId', 'name phone category rating userId')
      .populate('assignedBy', 'name phone role')
      .populate('reVerifiedBy', 'name phone role');

    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Work order not found' });
    }

    res.status(200).json({ success: true, data: workOrder });
  } catch (error) {
    next(error);
  }
};

// ─── 6. Get All Work Orders (Admin/Officer/Contractor — Paginated + Filtered) ─
exports.getAllWorkOrders = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      if (req.query.status === 'COMPLETED') {
        filter.status = { $in: ['COMPLETED', 'RE_VERIFIED'] };
      } else {
        filter.status = req.query.status;
      }
    }
    if (req.query.contractorId) filter.contractorId = req.query.contractorId;

    // If logged-in user is a Contractor, automatically filter query results to their assigned jobs
    if (req.user && req.user.role === 'CONTRACTOR') {
      const contractorIds = [req.user._id];
      const contractorDoc = await Contractor.findOne({
        $or: [
          { phone: req.user.phone },
          { _id: req.user._id },
          { userId: req.user._id },
        ],
      });
      if (contractorDoc) {
        contractorIds.push(contractorDoc._id);
        if (contractorDoc.userId) contractorIds.push(contractorDoc.userId);
      }
      filter.contractorId = { $in: [...new Set(contractorIds.filter(Boolean))] };
    }

    const [workOrders, total] = await Promise.all([
      WorkOrder.find(filter)
        .populate('reportId', 'title category status address location imageUrl ucNumber district')
        .populate('contractorId', 'name phone category rating userId')
        .populate('assignedBy', 'name role phone')
        .populate('reVerifiedBy', 'name role phone')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      WorkOrder.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: workOrders,
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

// ─── 7. Reject Completed Work Order (Street Rep / UC Officer Demands Rework) ─
exports.rejectWorkOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    const workOrder = await WorkOrder.findById(id)
      .populate('reportId', 'title category createdBy')
      .populate('contractorId', 'name phone fcmToken');

    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Work order not found' });
    }

    const reworkReason = reason || notes || 'Repair work did not meet quality standards. Rework requested.';

    workOrder.status = 'IN_PROGRESS';
    workOrder.inspectionNotes = reworkReason;
    await workOrder.save();

    if (workOrder.reportId) {
      await Report.findByIdAndUpdate(workOrder.reportId._id, { status: 'IN_PROGRESS' });
    }

    logAudit({
      actor: req.user._id,
      action: 'WORK_ORDER_REJECTED',
      targetModel: 'WorkOrder',
      targetId: workOrder._id,
      changes: { before: { status: 'COMPLETED' }, after: { status: 'IN_PROGRESS', reworkReason } },
      ipAddress: req.ip,
      description: `Work order rejected for rework: ${reworkReason}`,
    });

    if (workOrder.contractorId) {
      dispatchNotification({
        recipientId: workOrder.contractorId._id.toString(),
        recipientFcmToken: workOrder.contractorId.fcmToken || null,
        recipientPhone: workOrder.contractorId.phone || null,
        type: 'WORK_ORDER_REJECTED',
        title: '⚠️ Repair Rejected - Rework Required',
        body: `Work for "${workOrder.reportId?.title || 'Report'}" was rejected: ${reworkReason}`,
        data: { workOrderId: workOrder._id, reportId: workOrder.reportId?._id },
      }).catch((err) =>
        console.error('[Notification] Contractor rejection dispatch failed:', err.message)
      );
    }

    res.status(200).json({
      success: true,
      message: 'Work order rejected and sent back to contractor for rework.',
      data: workOrder,
    });
  } catch (error) {
    next(error);
  }
};
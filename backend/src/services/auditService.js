const AuditLog = require("../models/AuditLog");
const AppError = require("../utils/AppError");
const { startOfDay, endOfDay } = require("../utils/reportDates");

// =====================================================================
// PART 1 — WRITING audit records (used by every module since Step 4)
// =====================================================================

// Saves one audit record: who did what, to which record.
// Example: logAction({ userId, action: "LOGIN", entityType: "User", entityId: userId })
const logAction = async ({ userId, action, entityType, entityId, oldValue, newValue, metadata }) => {
    try {
        await AuditLog.create({
            user: userId,
            action,
            entityType,
            entityId,
            oldValue,
            newValue,
            metadata
        });
    }
    catch (error) {
        // A failed audit write should not undo or block the user's real action
        // (e.g. a successful login), so we only log it for the developer.
        console.error("Failed to write audit log:", error.message);
    }
};

// Compares two plain objects and keeps only the fields whose value changed.
// getChanges({ price: 10, name: "A" }, { price: 12, name: "A" })
//   → { oldValue: { price: 10 }, newValue: { price: 12 } }
const getChanges = (before, after) => {
    const oldValue = {};
    const newValue = {};

    for (const key of Object.keys(after)) {
        // String() so that ObjectIds and numbers compare by their value
        if (String(before[key]) !== String(after[key])) {
            oldValue[key] = before[key];
            newValue[key] = after[key];
        }
    }

    return { oldValue, newValue };
};

// =====================================================================
// PART 2 — READING audit records (the Audit Log API, admin only)
// There are deliberately no update/delete functions: the model blocks them too.
// =====================================================================

const USER_FIELDS = "name email role";

// GET /api/audit-logs?user=&action=&entityType=&entityId=&from=&to=&sort=&page=&limit=
const getAuditLogs = async ({ user, action, entityType, entityId, from, to, sort, page, limit }) => {
    const filter = {};
    if (user) filter.user = user;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    // No dates = all time. Days are in the business's time zone (same as reports).
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = startOfDay(from);
        if (to) filter.createdAt.$lte = endOfDay(to);
    }

    // "oldest" reads a record's history like a story; "newest" is the default for browsing
    const sortOrder = sort === "oldest" ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };

    const [auditLogs, total] = await Promise.all([
        AuditLog.find(filter)
            .populate("user", USER_FIELDS)
            .sort(sortOrder)
            .skip((page - 1) * limit)
            .limit(limit),
        AuditLog.countDocuments(filter)
    ]);

    return {
        auditLogs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// GET /api/audit-logs/:id
const getAuditLogById = async (auditLogId) => {
    const auditLog = await AuditLog.findById(auditLogId).populate("user", USER_FIELDS);
    if (!auditLog) {
        throw new AppError(404, "AUDIT_LOG_NOT_FOUND", "Audit log entry not found");
    }
    return auditLog;
};

// GET /api/audit-logs/filters — values for the frontend's filter dropdowns
const getAuditFilters = async () => {
    const [actions, entityTypes] = await Promise.all([
        AuditLog.distinct("action"),
        AuditLog.distinct("entityType")
    ]);
    return { actions: actions.sort(), entityTypes: entityTypes.sort() };
};

module.exports = { logAction, getChanges, getAuditLogs, getAuditLogById, getAuditFilters };

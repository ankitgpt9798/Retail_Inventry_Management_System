const AuditLog = require("../models/AuditLog");

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

module.exports = { logAction };

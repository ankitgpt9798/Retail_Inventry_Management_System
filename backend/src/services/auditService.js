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

module.exports = { logAction, getChanges };

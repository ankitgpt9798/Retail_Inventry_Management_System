const mongoose = require("mongoose");

// Who did what, to which record, and what changed. Only ever created, never edited.
const auditLogSchema = new mongoose.Schema(
    {
        // Can be empty for events with no logged-in user, e.g. a failed login
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        // e.g. "LOGIN", "PRODUCT_UPDATED", "TRANSFER_APPROVED"
        action: {
            type: String,
            required: true,
            trim: true
        },
        // e.g. "Product", "Order", "StockTransfer"
        entityType: {
            type: String,
            required: true
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId
        },
        // Mixed = any shape of object, because each entity has different fields
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        // Extra info such as IP address
        metadata: mongoose.Schema.Types.Mixed
    },
    // createdAt is the audit "timestamp"; audit records are never updated
    { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema, "auditLogs");

module.exports = AuditLog;

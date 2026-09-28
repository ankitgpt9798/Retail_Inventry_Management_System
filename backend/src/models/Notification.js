const mongoose = require("mongoose");
const { NOTIFICATION_TYPE } = require("../utils/constants");

// One notification for one user. A low-stock alert for 3 managers = 3 documents,
// so each manager can mark their own copy as read.
const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        type: {
            type: String,
            enum: Object.values(NOTIFICATION_TYPE),
            required: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        // Frontend page to open when clicked, e.g. "/orders/665f..."
        link: String,
        isRead: {
            type: Boolean,
            default: false
        },
        readAt: Date
    },
    { timestamps: true }
);

// Fast "my unread notifications" lookups
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema, "notifications");

module.exports = Notification;

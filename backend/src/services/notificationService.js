const Notification = require("../models/Notification");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const { USER_STATUS } = require("../utils/constants");

// =====================================================================
// PART 1 — CREATING notifications (used by inventory, transfers, purchases, orders)
// =====================================================================

// Sends the same notification to every ACTIVE user with one of the given roles.
// Each user gets their own copy, so each can mark it as read separately.
// excludeUserId: skip this user (e.g. don't tell a manager about their own request).
//
// Example:
// notifyRoles([ROLES.ADMIN, ROLES.INVENTORY_MANAGER], {
//     type: NOTIFICATION_TYPE.LOW_STOCK,
//     title: "Low stock",
//     message: "Keyboard K100 is below reorder level in DEL-01",
//     link: "/inventory/665f..."
// });
const notifyRoles = async (roles, { type, title, message, link }, excludeUserId) => {
    try {
        const filter = { role: { $in: roles }, status: USER_STATUS.ACTIVE };
        if (excludeUserId) {
            // $ne = "not equal"
            filter._id = { $ne: excludeUserId };
        }
        const recipients = await User.find(filter, "_id");

        const notifications = recipients.map((user) => ({
            recipient: user._id,
            type,
            title,
            message,
            link
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }
    }
    catch (error) {
        // Like audit logs: a failed alert must not undo the action that caused it
        console.error("Failed to create notifications:", error.message);
    }
};

// Sends a notification to one specific user
const notifyUser = async (userId, { type, title, message, link }) => {
    try {
        await Notification.create({ recipient: userId, type, title, message, link });
    }
    catch (error) {
        console.error("Failed to create notification:", error.message);
    }
};

// =====================================================================
// PART 2 — READING notifications (the Notifications API, one user's inbox)
//
// Every query below contains { recipient: userId }. That is what guarantees a
// user can only ever see or change THEIR OWN notifications: someone else's
// notification simply isn't found (→ 404).
// =====================================================================

const findMyNotificationOrFail = async (userId, notificationId) => {
    const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
    if (!notification) {
        throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
    }
    return notification;
};

// Used by the bell icon, so it's a single cheap count query
// (served by the index { recipient, isRead, createdAt })
const getUnreadCount = async (userId) => {
    return Notification.countDocuments({ recipient: userId, isRead: false });
};

// GET /api/notifications?isRead=&type=&page=&limit=
const getMyNotifications = async (userId, { isRead, type, page, limit }) => {
    const filter = { recipient: userId };
    // isRead is true, false or undefined (= show both); check undefined explicitly,
    // because "if (isRead)" would wrongly skip the filter when isRead is false
    if (isRead !== undefined) {
        filter.isRead = isRead;
    }
    if (type) {
        filter.type = type;
    }

    // Three independent queries run at the same time
    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Notification.countDocuments(filter),
        getUnreadCount(userId)
    ]);

    return {
        notifications,
        unreadCount,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// PUT /api/notifications/:id/read
// Idempotent: marking an already-read notification again keeps its original readAt
const markAsRead = async (userId, notificationId) => {
    const notification = await findMyNotificationOrFail(userId, notificationId);

    if (!notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();
    }

    return notification;
};

// PUT /api/notifications/read-all — one updateMany instead of a loop of saves.
// Returns how many notifications were changed.
const markAllAsRead = async (userId) => {
    const result = await Notification.updateMany(
        { recipient: userId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
    );
    return result.modifiedCount;
};

// DELETE /api/notifications/:id — a real delete: notifications are personal
// messages, not business records (the history lives in auditLogs / stockTransactions)
const deleteNotification = async (userId, notificationId) => {
    const result = await Notification.deleteOne({ _id: notificationId, recipient: userId });
    if (result.deletedCount === 0) {
        throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
    }
};

module.exports = {
    notifyRoles,
    notifyUser,
    getUnreadCount,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
};

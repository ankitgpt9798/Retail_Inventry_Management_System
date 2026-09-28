const Notification = require("../models/Notification");
const User = require("../models/User");
const { USER_STATUS } = require("../utils/constants");

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

module.exports = { notifyRoles, notifyUser };

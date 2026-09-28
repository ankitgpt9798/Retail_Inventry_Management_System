const Notification = require("../models/Notification");
const User = require("../models/User");
const { USER_STATUS } = require("../utils/constants");

// Sends the same notification to every ACTIVE user with one of the given roles.
// Each user gets their own copy, so each can mark it as read separately.
//
// Example:
// notifyRoles([ROLES.ADMIN, ROLES.INVENTORY_MANAGER], {
//     type: NOTIFICATION_TYPE.LOW_STOCK,
//     title: "Low stock",
//     message: "Keyboard K100 is below reorder level in DEL-01",
//     link: "/inventory/665f..."
// });
const notifyRoles = async (roles, { type, title, message, link }) => {
    try {
        const recipients = await User.find({ role: { $in: roles }, status: USER_STATUS.ACTIVE }, "_id");

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
        // Like audit logs: a failed alert must not undo the stock change that caused it
        console.error("Failed to create notifications:", error.message);
    }
};

module.exports = { notifyRoles };

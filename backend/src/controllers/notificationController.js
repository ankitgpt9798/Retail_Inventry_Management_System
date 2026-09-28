const notificationService = require("../services/notificationService");

// Every handler uses req.user._id (set by the protect middleware from the verified
// login cookie). The user id never comes from the URL or body, so nobody can ask
// for another person's inbox.

// GET /api/notifications
const getMyNotifications = async (req, res) => {
    const { notifications, unreadCount, pagination } = await notificationService.getMyNotifications(
        req.user._id,
        req.validatedQuery
    );

    res.status(200).json({
        success: true,
        message: "Notifications fetched successfully",
        data: { notifications, unreadCount, pagination }
    });
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
    const unreadCount = await notificationService.getUnreadCount(req.user._id);

    res.status(200).json({
        success: true,
        message: "Unread count fetched successfully",
        data: { unreadCount }
    });
};

// PUT /api/notifications/:id/read
const markAsRead = async (req, res) => {
    const notification = await notificationService.markAsRead(req.user._id, req.params.id);

    res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data: { notification }
    });
};

// PUT /api/notifications/read-all
const markAllAsRead = async (req, res) => {
    const updatedCount = await notificationService.markAllAsRead(req.user._id);

    res.status(200).json({
        success: true,
        message: `${updatedCount} notification(s) marked as read`,
        data: { updatedCount }
    });
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res) => {
    await notificationService.deleteNotification(req.user._id, req.params.id);

    res.status(200).json({
        success: true,
        message: "Notification deleted",
        data: {}
    });
};

module.exports = { getMyNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification };

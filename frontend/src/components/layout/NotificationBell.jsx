import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import api, { getErrorMessage } from "../../services/api";
import useUnreadCount from "../../hooks/useUnreadCount";
import { formatDateTime } from "../../utils/format";

// The bell in the top navigation: unread count + the 5 latest notifications.
// Uses the Notifications API from Step 14.
const NotificationBell = () => {
    const { unreadCount, refresh } = useUnreadCount();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const detailsRef = useRef(null);
    const navigate = useNavigate();

    // <details> opens/closes the dropdown; we load the list each time it opens
    const handleToggle = async () => {
        if (!detailsRef.current.open) return;

        setLoading(true);
        setError("");
        try {
            const response = await api.get("/notifications", { params: { limit: 5 } });
            setNotifications(response.data.data.notifications);
        }
        catch (requestError) {
            setError(getErrorMessage(requestError, "Could not load notifications"));
        }
        finally {
            setLoading(false);
        }
    };

    // Clicking a notification reads it and, when it links to a page (e.g. an order), opens that page
    const openNotification = async (notification) => {
        await markAsRead(notification);
        if (notification.link) {
            detailsRef.current.open = false;
            navigate(notification.link);
        }
    };

    const markAsRead = async (notification) => {
        if (notification.isRead) return;
        try {
            await api.put(`/notifications/${notification._id}/read`);
            setNotifications((current) =>
                current.map((item) => (item._id === notification._id ? { ...item, isRead: true } : item))
            );
            refresh();
        }
        catch (requestError) {
            setError(getErrorMessage(requestError, "Could not mark as read"));
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put("/notifications/read-all");
            setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
            refresh();
        }
        catch (requestError) {
            setError(getErrorMessage(requestError, "Could not mark all as read"));
        }
    };

    return (
        <details ref={detailsRef} className="dropdown dropdown-end" onToggle={handleToggle}>
            <summary
                className="btn btn-ghost btn-circle list-none"
                aria-label={`Notifications, ${unreadCount} unread`}
            >
                <div className="indicator">
                    <Bell size={20} aria-hidden="true" />
                    {unreadCount > 0 && (
                        <span className="indicator-item badge badge-error badge-xs">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </div>
            </summary>

            <div className="dropdown-content z-40 mt-2 w-80 rounded-box border border-base-300 bg-base-100 shadow-lg">
                <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
                    <span className="font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                        <button type="button" className="btn btn-link btn-xs" onClick={markAllAsRead}>
                            Mark all as read
                        </button>
                    )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {loading && <p className="px-4 py-6 text-center text-sm text-base-content/60">Loading…</p>}
                    {error && <p className="px-4 py-3 text-sm text-error">{error}</p>}
                    {!loading && !error && notifications.length === 0 && (
                        <p className="px-4 py-6 text-center text-sm text-base-content/60">You're all caught up.</p>
                    )}
                    {!loading && notifications.map((notification) => (
                        <button
                            type="button"
                            key={notification._id}
                            onClick={() => openNotification(notification)}
                            className={`block w-full border-b border-base-200 px-4 py-3 text-left hover:bg-base-200 ${notification.isRead ? "opacity-60" : ""}`}
                        >
                            <span className="flex items-center gap-2 text-sm font-medium">
                                {!notification.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>}
                                {notification.title}
                            </span>
                            <span className="mt-1 block text-sm text-base-content/70">{notification.message}</span>
                            <span className="mt-1 block text-xs text-base-content/50">{formatDateTime(notification.createdAt)}</span>
                        </button>
                    ))}
                </div>

                <div className="border-t border-base-300 px-4 py-2 text-center">
                    <Link to="/notifications" className="link link-primary text-sm" onClick={() => { detailsRef.current.open = false; }}>
                        View all notifications
                    </Link>
                </div>
            </div>
        </details>
    );
};

export default NotificationBell;

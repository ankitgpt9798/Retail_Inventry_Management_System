import { useCallback, useEffect, useState } from "react";
import api from "../services/api";

// The name of the browser event other parts of the app fire after reading / deleting notifications
export const NOTIFICATIONS_CHANGED = "notifications-changed";

// How often the bell asks the backend for new notifications
const REFRESH_EVERY_MS = 60 * 1000;

// Keeps the notification bell's number up to date.
// Returns { unreadCount, refresh } — call refresh() after marking notifications read.
const useUnreadCount = () => {
    const [unreadCount, setUnreadCount] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const response = await api.get("/notifications/unread-count");
            setUnreadCount(response.data.data.unreadCount);
        }
        catch (error) {
            // The bell is not critical: keep the old number and log for the developer
            console.error("Could not load unread notification count:", error);
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, REFRESH_EVERY_MS);
        // The notifications page announces its changes, so the bell updates at once instead of within a minute
        window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
        // Stop the timer and the listener when the component disappears (e.g. after logout)
        return () => {
            clearInterval(timer);
            window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
        };
    }, [refresh]);

    return { unreadCount, refresh };
};

export default useUnreadCount;

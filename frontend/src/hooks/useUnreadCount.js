import { useCallback, useEffect, useState } from "react";
import api from "../services/api";

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
        // Stop the timer when the component disappears (e.g. after logout)
        return () => clearInterval(timer);
    }, [refresh]);

    return { unreadCount, refresh };
};

export default useUnreadCount;

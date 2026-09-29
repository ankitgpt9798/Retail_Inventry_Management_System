import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, Trash2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import useList from "../../hooks/useList";
import { NOTIFICATIONS_CHANGED } from "../../hooks/useUnreadCount";
import api, { getErrorMessage } from "../../services/api";
import { formatDateTime } from "../../utils/format";
import { NOTIFICATION_TYPE_LABELS } from "../../utils/notificationTypes";

const PAGE_SIZE = 10;

// Tells the bell in the top bar to refresh its unread number right away
const announceChange = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

// The full notification inbox (the bell only shows the latest five)
const NotificationsPage = () => {
    const navigate = useNavigate();
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const [actionError, setActionError] = useState("");

    const { items, pagination, data, isLoading, error, reload } = useList("/notifications", "notifications", {
        isRead: unreadOnly ? "false" : "",
        type,
        page,
        limit: PAGE_SIZE
    });
    const unreadCount = data?.unreadCount ?? 0;

    const withPageReset = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

    // Runs one request, then refreshes the list and the bell; a failure is shown above the list
    const change = async (request, fallbackMessage) => {
        setActionError("");
        try {
            await request();
            announceChange();
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, fallbackMessage));
        }
    };

    const markRead = (notification) => change(() => api.put(`/notifications/${notification._id}/read`), "Could not mark as read");
    const markAllRead = () => change(() => api.put("/notifications/read-all"), "Could not mark all as read");
    const remove = (notification) => change(() => api.delete(`/notifications/${notification._id}`), "Could not delete the notification");

    // Clicking a notification reads it and opens the page it is about (e.g. the order)
    const open = async (notification) => {
        if (!notification.isRead) {
            await markRead(notification);
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    return (
        <>
            <PageHeader title="Notifications" description="Alerts about stock, orders, transfers and purchases.">
                <button type="button" className="btn" onClick={markAllRead} disabled={unreadCount === 0}>
                    <CheckCheck size={16} aria-hidden="true" /> Mark all as read
                </button>
            </PageHeader>

            {actionError && (
                <div className="mb-4">
                    <ErrorAlert message={actionError} />
                </div>
            )}

            <div className="card border border-base-300 bg-base-100">
                <div className="flex flex-wrap items-center gap-3 border-b border-base-300 p-4">
                    <div role="tablist" aria-label="Show" className="tabs tabs-box">
                        <button type="button" role="tab" aria-selected={!unreadOnly} className={`tab ${!unreadOnly ? "tab-active" : ""}`} onClick={() => withPageReset(setUnreadOnly)(false)}>
                            All
                        </button>
                        <button type="button" role="tab" aria-selected={unreadOnly} className={`tab ${unreadOnly ? "tab-active" : ""}`} onClick={() => withPageReset(setUnreadOnly)(true)}>
                            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
                        </button>
                    </div>
                    <FilterSelect label="Type" value={type} onChange={withPageReset(setType)}>
                        <option value="">All types</option>
                        {Object.entries(NOTIFICATION_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </FilterSelect>
                </div>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading notifications…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">{unreadOnly ? "You're all caught up." : "No notifications yet."}</p>
                ) : (
                    <ul>
                        {items.map((notification) => (
                            <li key={notification._id} className={`flex items-start gap-3 border-b border-base-200 px-4 py-3 last:border-b-0 ${notification.isRead ? "opacity-70" : ""}`}>
                                <span
                                    className={`mt-2 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? "bg-transparent" : "bg-primary"}`}
                                    aria-label={notification.isRead ? undefined : "Unread"}
                                ></span>
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(notification)}>
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{notification.title}</span>
                                        <span className="badge badge-sm badge-soft">{NOTIFICATION_TYPE_LABELS[notification.type] || notification.type}</span>
                                    </span>
                                    <span className="mt-1 block text-sm text-base-content/70">{notification.message}</span>
                                    <span className="mt-1 block text-xs text-base-content/50">{formatDateTime(notification.createdAt)}</span>
                                </button>
                                <div className="flex shrink-0 gap-1">
                                    {!notification.isRead && (
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => markRead(notification)} aria-label={`Mark "${notification.title}" as read`}>
                                            Mark read
                                        </button>
                                    )}
                                    <button type="button" className="btn btn-ghost btn-sm btn-square text-error" onClick={() => remove(notification)} aria-label={`Delete "${notification.title}"`}>
                                        <Trash2 size={14} aria-hidden="true" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
        </>
    );
};

export default NotificationsPage;

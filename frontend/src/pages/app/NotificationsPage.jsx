import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import Pagination from "../../components/common/Pagination";
import Badge from "../../components/common/Badge";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import { NOTIFICATIONS_CHANGED } from "../../hooks/useUnreadCount";
import api, { getErrorMessage } from "../../services/api";
import { formatDateTime } from "../../utils/format";
import { NOTIFICATION_TYPE_LABELS } from "../../utils/notificationTypes";

const PAGE_SIZE = 10;

const INITIAL_FILTERS = { show: "all", type: "" };

// Tells the bell in the top bar to refresh its unread number right away
const announceChange = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

// The full notification inbox (the bell only shows the latest five)
const NotificationsPage = () => {
    const navigate = useNavigate();
    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const unreadOnly = filters.show === "unread";
    const [actionError, setActionError] = useState("");

    const { items, pagination, data, isLoading, error, reload } = useList("/notifications", "notifications", {
        isRead: unreadOnly ? "false" : "",
        type: filters.type,
        page,
        limit: PAGE_SIZE
    });
    const unreadCount = data?.unreadCount ?? 0;

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

            <PageAlerts error={actionError} />

            <ListToolbar hasFilters={filters.type !== ""} onClear={clearFilters}>
                <div role="tablist" aria-label="Show" className="inline-flex w-full gap-1 rounded-lg bg-base-200 p-1 md:w-auto">
                    {[
                        { value: "all", label: "All" },
                        { value: "unread", label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` }
                    ].map((tab) => (
                        <button
                            key={tab.value}
                            type="button"
                            role="tab"
                            aria-selected={filters.show === tab.value}
                            onClick={() => setFilter("show", tab.value)}
                            className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors md:flex-none ${
                                filters.show === tab.value ? "bg-base-100 text-base-content shadow-card" : "text-base-content/60 hover:text-base-content"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <FilterSelect label="Type" value={filters.type} onChange={(value) => setFilter("type", value)}>
                    <option value="">All types</option>
                    {Object.entries(NOTIFICATION_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="notifications"
                isFiltered={hasFilters && !unreadOnly}
                onClearFilters={clearFilters}
                emptyIcon={Bell}
                emptyTitle={unreadOnly ? "You're all caught up." : "No notifications yet."}
                grid="grid gap-3"
                skeletons={4}
                renderItem={(notification) => (
                    <article
                        key={notification._id}
                        aria-label={notification.title}
                        className={`flex items-start gap-3 rounded-xl border bg-base-100 p-4 shadow-card ${notification.isRead ? "border-base-300" : "border-primary/30 bg-primary-soft/40"}`}
                    >
                        <span
                            className={`mt-2 size-2 shrink-0 rounded-full ${notification.isRead ? "bg-transparent" : "bg-primary"}`}
                            aria-label={notification.isRead ? undefined : "Unread"}
                        ></span>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(notification)}>
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{notification.title}</span>
                                <Badge tone="neutral" dot={false}>
                                    {NOTIFICATION_TYPE_LABELS[notification.type] || notification.type}
                                </Badge>
                            </span>
                            <span className="mt-1 block break-words text-sm text-base-content/70">{notification.message}</span>
                            <span className="mt-1 block text-xs text-base-content/50">{formatDateTime(notification.createdAt)}</span>
                        </button>
                        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            {!notification.isRead && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => markRead(notification)} aria-label={`Mark "${notification.title}" as read`}>
                                    <CheckCheck size={14} aria-hidden="true" />
                                    <span className="hidden sm:inline">Mark read</span>
                                </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm btn-square text-error" onClick={() => remove(notification)} aria-label={`Delete "${notification.title}"`}>
                                <Trash2 size={14} aria-hidden="true" />
                            </button>
                        </div>
                    </article>
                )}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="notifications" />
        </>
    );
};

export default NotificationsPage;

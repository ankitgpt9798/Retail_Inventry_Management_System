import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { DateFilter, FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import Badge from "../../components/common/Badge";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api from "../../services/api";
import { formatDateTime } from "../../utils/format";

const PAGE_SIZE = 15;

const INITIAL_FILTERS = { action: "", entityType: "", user: "", from: "", to: "", sort: "newest" };

// "PRODUCT_UPDATED" → "Product updated"
const humanizeAction = (action) => {
    const text = String(action || "").toLowerCase().replaceAll("_", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
};

// "StockTransfer" → "Stock transfer" (sentence case, like the actions)
const humanizeEntity = (type) => {
    const text = String(type || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
};

const show = (value) => {
    if (value === undefined || value === null || value === "") return "—";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
};

// Field-by-field before/after, from the oldValue / newValue the backend recorded
const buildChanges = (oldValue, newValue) => {
    const before = oldValue && typeof oldValue === "object" ? oldValue : {};
    const after = newValue && typeof newValue === "object" ? newValue : {};
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return fields.map((field) => ({ field, before: before[field], after: after[field] }));
};

// The audit trail: who did what, and when. Read-only; the backend never lets a record change.
const AuditLogPage = () => {
    const { filters, setFilter: changeFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const [expanded, setExpanded] = useState(null); // the id of the card whose details are open

    // The actions and record types that actually occur in the log (for the filter lists)
    const [filterChoices, setFilterChoices] = useState({ actions: [], entityTypes: [] });
    useEffect(() => {
        api.get("/audit-logs/filters")
            .then((response) => setFilterChoices(response.data.data))
            .catch(() => {}); // the filters just stay empty; the log itself still works
    }, []);
    const users = useOptions("/users", "users");

    const { items, pagination, isLoading, error, reload } = useList("/audit-logs", "auditLogs", {
        ...filters,
        page,
        limit: PAGE_SIZE
    });

    // A new filter shows other entries, so close any open details
    const setFilter = (name, value) => {
        changeFilter(name, value);
        setExpanded(null);
    };

    const renderEntry = (entry) => {
        const isOpen = expanded === entry._id;
        const changes = buildChanges(entry.oldValue, entry.newValue);
        const hasDetails = changes.length > 0 || Boolean(entry.metadata);
        return (
            <RecordCard
                key={entry._id}
                label={`${humanizeAction(entry.action)} · ${formatDateTime(entry.createdAt)}`}
                title={humanizeAction(entry.action)}
                code={`${humanizeEntity(entry.entityType)} · ${String(entry.entityId || "").slice(-8)}`}
                subtitle={entry.user?.name || "System"}
                icon={ScrollText}
                status={<Badge tone="neutral" dot={false}>{humanizeEntity(entry.entityType)}</Badge>}
                footer={
                    hasDetails && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} details: ${humanizeAction(entry.action)}`}
                            onClick={() => setExpanded(isOpen ? null : entry._id)}
                        >
                            {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                            Details
                        </button>
                    )
                }
            >
                <CardFields>
                    <CardField label="When" value={formatDateTime(entry.createdAt)} />
                    <CardField label="By" value={entry.user?.email || "System"} />
                </CardFields>
                {isOpen && (
                    <div className="mt-4 space-y-3 rounded-lg bg-base-200/70 p-3 text-sm">
                        {changes.length > 0 && (
                            <dl className="space-y-2">
                                {changes.map((change) => (
                                    <div key={change.field}>
                                        <dt className="font-mono text-xs text-base-content/60">{change.field}</dt>
                                        <dd className="break-all">
                                            <span className="text-error-strong line-through decoration-1">{show(change.before)}</span>
                                            <span className="mx-1.5 text-base-content/50">→</span>
                                            <span className="font-medium text-success-strong">{show(change.after)}</span>
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                        {entry.metadata && (
                            <p className="break-all text-xs text-base-content/70">
                                <span className="font-semibold">Extra details:</span> {show(entry.metadata)}
                            </p>
                        )}
                    </div>
                )}
            </RecordCard>
        );
    };

    return (
        <>
            <PageHeader title="Audit log" description="A permanent record of who changed what. It can't be edited or deleted." />

            <ListToolbar hasFilters={hasFilters} onClear={clearFilters}>
                <FilterSelect label="Action" value={filters.action} onChange={(value) => setFilter("action", value)}>
                    <option value="">All actions</option>
                    {filterChoices.actions.map((value) => (
                        <option key={value} value={value}>
                            {humanizeAction(value)}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Record type" value={filters.entityType} onChange={(value) => setFilter("entityType", value)}>
                    <option value="">All record types</option>
                    {filterChoices.entityTypes.map((value) => (
                        <option key={value} value={value}>
                            {humanizeEntity(value)}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="User" value={filters.user} onChange={(value) => setFilter("user", value)}>
                    <option value="">All users</option>
                    {users.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
                <DateFilter label="From" value={filters.from} max={filters.to} onChange={(value) => setFilter("from", value)} />
                <DateFilter label="To" value={filters.to} min={filters.from} onChange={(value) => setFilter("to", value)} />
                <FilterSelect label="Order" value={filters.sort} onChange={(value) => setFilter("sort", value)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="audit records"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={ScrollText}
                emptyMessage="Changes people make (creating, editing, approving…) are recorded here."
                renderItem={renderEntry}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="records" />
        </>
    );
};

export default AuditLogPage;

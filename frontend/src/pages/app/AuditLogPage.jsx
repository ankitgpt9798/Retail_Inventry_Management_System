import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api from "../../services/api";
import { formatDateTime } from "../../utils/format";

const PAGE_SIZE = 15;

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
    const [action, setAction] = useState("");
    const [entityType, setEntityType] = useState("");
    const [user, setUser] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState(null); // the id of the row whose details are open

    // The actions and record types that actually occur in the log (for the filter lists)
    const [filterChoices, setFilterChoices] = useState({ actions: [], entityTypes: [] });
    useEffect(() => {
        api.get("/audit-logs/filters")
            .then((response) => setFilterChoices(response.data.data))
            .catch(() => {}); // the filters just stay empty; the log itself still works
    }, []);
    const users = useOptions("/users", "users");

    const { items, pagination, isLoading, error, reload } = useList("/audit-logs", "auditLogs", {
        action,
        entityType,
        user,
        from,
        to,
        sort,
        page,
        limit: PAGE_SIZE
    });

    const withPageReset = (setter) => (value) => {
        setter(value);
        setPage(1);
        setExpanded(null);
    };

    return (
        <>
            <PageHeader title="Audit log" description="A permanent record of who changed what. It can't be edited or deleted." />

            <div className="card border border-base-300 bg-base-100">
                <div className="flex flex-wrap items-center gap-3 border-b border-base-300 p-4">
                    <FilterSelect label="Action" value={action} onChange={withPageReset(setAction)}>
                        <option value="">All actions</option>
                        {filterChoices.actions.map((value) => (
                            <option key={value} value={value}>
                                {humanizeAction(value)}
                            </option>
                        ))}
                    </FilterSelect>
                    <FilterSelect label="Record type" value={entityType} onChange={withPageReset(setEntityType)}>
                        <option value="">All record types</option>
                        {filterChoices.entityTypes.map((value) => (
                            <option key={value} value={value}>
                                {humanizeEntity(value)}
                            </option>
                        ))}
                    </FilterSelect>
                    <FilterSelect label="User" value={user} onChange={withPageReset(setUser)}>
                        <option value="">All users</option>
                        {users.map((item) => (
                            <option key={item._id} value={item._id}>
                                {item.name}
                            </option>
                        ))}
                    </FilterSelect>
                    <label className="flex items-center gap-2 text-sm">
                        From
                        <input type="date" className="input" value={from} max={to || undefined} onChange={(event) => withPageReset(setFrom)(event.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        To
                        <input type="date" className="input" value={to} min={from || undefined} onChange={(event) => withPageReset(setTo)(event.target.value)} />
                    </label>
                    <FilterSelect label="Order" value={sort} onChange={withPageReset(setSort)}>
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                    </FilterSelect>
                </div>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading audit log…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No audit records found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Record</th>
                                    <th className="text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((entry) => {
                                    const isOpen = expanded === entry._id;
                                    const changes = buildChanges(entry.oldValue, entry.newValue);
                                    const hasDetails = changes.length > 0 || Boolean(entry.metadata);
                                    return (
                                        <Fragment key={entry._id}>
                                            <tr>
                                                <td className="whitespace-nowrap text-sm">{formatDateTime(entry.createdAt)}</td>
                                                <td>
                                                    <div className="font-medium">{entry.user?.name || "System"}</div>
                                                    {entry.user?.email && <div className="text-xs text-base-content/60">{entry.user.email}</div>}
                                                </td>
                                                <td>{humanizeAction(entry.action)}</td>
                                                <td>
                                                    <div>{humanizeEntity(entry.entityType)}</div>
                                                    <div className="font-mono text-xs text-base-content/60">{String(entry.entityId || "").slice(-8)}</div>
                                                </td>
                                                <td className="text-right">
                                                    {hasDetails && (
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
                                                    )}
                                                </td>
                                            </tr>
                                            {isOpen && (
                                                <tr>
                                                    <td colSpan={5} className="bg-base-200/60">
                                                        <div className="space-y-3 p-2">
                                                            {changes.length > 0 && (
                                                                <table className="table table-sm">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Field</th>
                                                                            <th>Before</th>
                                                                            <th>After</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {changes.map((change) => (
                                                                            <tr key={change.field}>
                                                                                <td className="font-mono text-xs">{change.field}</td>
                                                                                <td className="break-all">{show(change.before)}</td>
                                                                                <td className="break-all">{show(change.after)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            )}
                                                            {entry.metadata && (
                                                                <p className="break-all text-xs text-base-content/70">
                                                                    <span className="font-semibold">Extra details:</span> {show(entry.metadata)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
        </>
    );
};

export default AuditLogPage;

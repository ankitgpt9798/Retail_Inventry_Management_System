import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { formatDateTime, formatNumber } from "../../utils/format";

const PAGE_SIZE = 15;

const TYPE_LABELS = {
    STOCK_IN: "Stock in",
    STOCK_OUT: "Stock out",
    TRANSFER_IN: "Transfer in",
    TRANSFER_OUT: "Transfer out",
    ADJUSTMENT: "Adjustment"
};

// Stock going up is green, going down is red
const isIncrease = (transaction) => transaction.quantityAfter >= transaction.quantityBefore;

// The full movement log (read-only): who changed which stock, when, and why
const StockHistoryPage = () => {
    const [type, setType] = useState("");
    const [warehouse, setWarehouse] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useState(1);

    const warehouses = useOptions("/warehouses", "warehouses");

    // A plain date such as "2026-09-28" means the START of that day for `from`,
    // so `to` is sent as the END of its day, otherwise that whole day would be left out
    const { items, pagination, isLoading, error, reload } = useList("/inventory/transactions", "transactions", {
        type,
        warehouse,
        from: from ? `${from}T00:00:00` : "",
        to: to ? `${to}T23:59:59` : "",
        page,
        limit: PAGE_SIZE
    });

    const withPageReset = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

    return (
        <>
            <PageHeader title="Stock history" description="Every stock movement, newest first.">
                <Link to="/inventory" className="btn">
                    <ArrowLeft size={16} aria-hidden="true" /> Back to inventory
                </Link>
            </PageHeader>

            <div className="card border border-base-300 bg-base-100">
                <div className="flex flex-wrap items-center gap-3 border-b border-base-300 p-4">
                    <FilterSelect label="Type" value={type} onChange={withPageReset(setType)}>
                        <option value="">All types</option>
                        {Object.entries(TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </FilterSelect>
                    <FilterSelect label="Warehouse" value={warehouse} onChange={withPageReset(setWarehouse)}>
                        <option value="">All warehouses</option>
                        {warehouses.map((item) => (
                            <option key={item._id} value={item._id}>
                                {item.name}
                            </option>
                        ))}
                    </FilterSelect>
                    <label className="flex items-center gap-2 text-sm">
                        From
                        <input
                            type="date"
                            className="input"
                            value={from}
                            max={to || undefined}
                            onChange={(event) => withPageReset(setFrom)(event.target.value)}
                        />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        To
                        <input
                            type="date"
                            className="input"
                            value={to}
                            min={from || undefined}
                            onChange={(event) => withPageReset(setTo)(event.target.value)}
                        />
                    </label>
                </div>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading history…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No stock movements found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Product</th>
                                    <th>Warehouse</th>
                                    <th>Type</th>
                                    <th className="text-right">Quantity</th>
                                    <th className="text-right">Before → after</th>
                                    <th>By</th>
                                    <th>Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((transaction) => (
                                    <tr key={transaction._id}>
                                        <td className="whitespace-nowrap text-sm">{formatDateTime(transaction.createdAt)}</td>
                                        <td>
                                            <div className="font-medium">{transaction.product?.name}</div>
                                            <div className="font-mono text-xs text-base-content/60">{transaction.product?.sku}</div>
                                        </td>
                                        <td>{transaction.warehouse?.name}</td>
                                        <td>{TYPE_LABELS[transaction.type] || transaction.type}</td>
                                        <td className={`text-right font-medium ${isIncrease(transaction) ? "text-success" : "text-error"}`}>
                                            {isIncrease(transaction) ? "+" : "−"}
                                            {formatNumber(transaction.quantity)}
                                        </td>
                                        <td className="whitespace-nowrap text-right text-sm">
                                            {formatNumber(transaction.quantityBefore)} → {formatNumber(transaction.quantityAfter)}
                                        </td>
                                        <td>{transaction.performedBy?.name || "—"}</td>
                                        <td className="text-sm text-base-content/70">{transaction.note || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
        </>
    );
};

export default StockHistoryPage;

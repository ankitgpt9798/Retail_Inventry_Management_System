import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, History } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { DateFilter, FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { formatDateTime, formatNumber } from "../../utils/format";
import { TRANSACTION_TYPE_STYLES } from "../../utils/statusStyles";

const PAGE_SIZE = 15;

const INITIAL_FILTERS = { type: "", warehouse: "", from: "", to: "", sort: "newest" };

// Quick buttons above the list. "Adjustments" = stock corrections (damaged, expired, counted)
const QUICK_TYPES = [
    { value: "", label: "All movements" },
    { value: "ADJUSTMENT", label: "Adjustments" },
    { value: "STOCK_IN", label: "Stock in" },
    { value: "STOCK_OUT", label: "Stock out" }
];

// Stock going up is green, going down is red
const isIncrease = (transaction) => transaction.quantityAfter >= transaction.quantityBefore;

// The full movement log (read-only): who changed which stock, when, and why
const StockHistoryPage = () => {
    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);

    const warehouses = useOptions("/warehouses", "warehouses");

    // A plain date such as "2026-09-28" means the START of that day for `from`,
    // so `to` is sent as the END of its day, otherwise that whole day would be left out
    const { items, pagination, isLoading, error, reload } = useList("/inventory/transactions", "transactions", {
        ...filters,
        from: filters.from ? `${filters.from}T00:00:00` : "",
        to: filters.to ? `${filters.to}T23:59:59` : "",
        page,
        limit: PAGE_SIZE
    });

    const renderTransaction = (transaction) => {
        const up = isIncrease(transaction);
        return (
            <RecordCard
                key={transaction._id}
                label={`${TRANSACTION_TYPE_STYLES[transaction.type]?.label || transaction.type}: ${transaction.product?.name}`}
                title={transaction.product?.name}
                code={transaction.product?.sku}
                subtitle={transaction.warehouse?.name}
                icon={up ? ArrowUpRight : ArrowDownRight}
                status={<StatusBadge status={transaction.type} styles={TRANSACTION_TYPE_STYLES} />}
            >
                <CardFields>
                    <CardField label="Quantity" value={`${up ? "+" : "−"}${formatNumber(transaction.quantity)}`} strong tone={up ? "success" : "error"} />
                    <CardField label="Before → after" value={`${formatNumber(transaction.quantityBefore)} → ${formatNumber(transaction.quantityAfter)}`} />
                    <CardField label="When" value={formatDateTime(transaction.createdAt)} />
                    <CardField label="By" value={transaction.performedBy?.name || "—"} />
                    {transaction.note && <CardField label="Note" value={transaction.note} wide />}
                </CardFields>
            </RecordCard>
        );
    };

    return (
        <>
            <PageHeader title="Stock history" description="Every stock movement and adjustment, newest first.">
                <Link to="/inventory" className="btn">
                    <ArrowLeft size={16} aria-hidden="true" /> Back to inventory
                </Link>
            </PageHeader>

            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Quick filters">
                {QUICK_TYPES.map((option) => (
                    <button
                        key={option.value || "all"}
                        type="button"
                        aria-pressed={filters.type === option.value}
                        onClick={() => setFilter("type", option.value)}
                        className={`btn btn-sm rounded-full ${filters.type === option.value ? "btn-primary" : ""}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <ListToolbar hasFilters={hasFilters} onClear={clearFilters}>
                <FilterSelect label="Type" value={filters.type} onChange={(value) => setFilter("type", value)}>
                    <option value="">All types</option>
                    {Object.entries(TRANSACTION_TYPE_STYLES).map(([value, style]) => (
                        <option key={value} value={value}>
                            {style.label}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Warehouse" value={filters.warehouse} onChange={(value) => setFilter("warehouse", value)}>
                    <option value="">All warehouses</option>
                    {warehouses.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
                <DateFilter label="From" value={filters.from} max={filters.to} onChange={(value) => setFilter("from", value)} />
                <DateFilter label="To" value={filters.to} min={filters.from} onChange={(value) => setFilter("to", value)} />
                <FilterSelect label="Sort by" value={filters.sort} onChange={(value) => setFilter("sort", value)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="stock movements"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={History}
                emptyMessage="Every stock in, stock out, transfer and adjustment will be listed here."
                renderItem={renderTransaction}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="movements" />
        </>
    );
};

export default StockHistoryPage;

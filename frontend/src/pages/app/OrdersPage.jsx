import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Eye, Pencil, Plus, ShoppingCart } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { DateFilter, FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { ORDER_STATUS_STYLES } from "../../utils/orderStatus";
import { PAYMENT_STATUS_STYLES } from "../../utils/statusStyles";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "amount_high", label: "Amount: high to low" },
    { value: "amount_low", label: "Amount: low to high" }
];

const INITIAL_FILTERS = { search: "", status: "", paymentStatus: "", warehouse: "", from: "", to: "", sort: "newest" };

// Customer (sales) orders
const OrdersPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("orders", role);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    const warehouses = useOptions("/warehouses", "warehouses");

    // "to" is sent as the END of its day, otherwise orders placed that day would be left out
    const { items, pagination, isLoading, error, reload } = useList("/orders", "orders", {
        ...filters,
        search: debouncedSearch,
        from: filters.from ? `${filters.from}T00:00:00` : "",
        to: filters.to ? `${filters.to}T23:59:59` : "",
        page,
        limit: PAGE_SIZE
    });

    const newOrderButton = mayEdit && (
        <Link to="/orders/new" className="btn btn-primary">
            <Plus size={16} aria-hidden="true" /> New order
        </Link>
    );

    const renderOrder = (order) => (
        <RecordCard
            key={order._id}
            label={order.orderNumber}
            title={order.customer?.name}
            titleTo={`/orders/${order._id}`}
            code={order.orderNumber}
            subtitle={formatDateTime(order.createdAt)}
            icon={ShoppingCart}
            status={
                <>
                    <StatusBadge status={order.status} styles={ORDER_STATUS_STYLES} />
                    <StatusBadge status={order.paymentStatus} styles={PAYMENT_STATUS_STYLES} />
                </>
            }
            footer={
                <>
                    {mayEdit && order.status === "PENDING" && (
                        <Link to={`/orders/${order._id}/edit`} className="btn btn-ghost btn-sm" aria-label={`Edit ${order.orderNumber}`}>
                            <Pencil size={14} aria-hidden="true" /> Edit
                        </Link>
                    )}
                    <Link to={`/orders/${order._id}`} className="btn btn-sm" aria-label={`View ${order.orderNumber}`}>
                        <Eye size={14} aria-hidden="true" /> View
                    </Link>
                </>
            }
        >
            <CardFields>
                <CardField label="Total" value={formatCurrency(order.totalAmount)} strong />
                <CardField label="Warehouse" value={order.warehouse?.code || "—"} />
                <CardField label="Phone" value={order.customer?.phone || "—"} />
                <CardField label="Taken by" value={order.createdBy?.name || "—"} />
                {order.trackingNumber && <CardField label="Tracking" value={`${order.carrier || ""} ${order.trackingNumber}`.trim()} wide mono />}
            </CardFields>
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Orders" description="Customer (sales) orders, from pending to delivered.">
                {newOrderButton}
            </PageHeader>

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Order number, customer, email or phone…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    {Object.entries(ORDER_STATUS_STYLES).map(([value, style]) => (
                        <option key={value} value={value}>
                            {style.label}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Payment" value={filters.paymentStatus} onChange={(value) => setFilter("paymentStatus", value)}>
                    <option value="">All payments</option>
                    {Object.entries(PAYMENT_STATUS_STYLES).map(([value, style]) => (
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
                <FilterSelect label="Sort by" value={filters.sort} onChange={(value) => setFilter("sort", value)}>
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </FilterSelect>
                <DateFilter label="From" value={filters.from} max={filters.to} onChange={(value) => setFilter("from", value)} />
                <DateFilter label="To" value={filters.to} min={filters.from} onChange={(value) => setFilter("to", value)} />
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="orders"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={ShoppingCart}
                emptyMessage="Orders you take for customers will appear here."
                renderItem={renderOrder}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="orders" />
        </>
    );
};

export default OrdersPage;

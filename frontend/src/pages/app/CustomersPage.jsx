import { Link } from "react-router-dom";
import { Mail, MapPin, Phone, ShoppingCart, UserRound } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import Badge from "../../components/common/Badge";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import { formatCurrency, formatDate, formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "recent", label: "Most recent order" },
    { value: "name", label: "Name A–Z" },
    { value: "spent_high", label: "Highest spend" },
    { value: "orders_high", label: "Most orders" }
];

const INITIAL_FILTERS = { search: "", sort: "recent" };

// Customers don't log in; the backend builds this list from the details saved on their orders
// (GET /api/customers), so it is read-only here. To change a customer's details, edit a pending order.
const CustomersPage = () => {
    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    const { items, pagination, isLoading, error, reload } = useList("/customers", "customers", {
        ...filters,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE
    });

    const renderCustomer = (customer) => (
        <RecordCard
            key={customer.key}
            label={customer.name}
            title={customer.name}
            subtitle={customer.email || "No email on file"}
            icon={UserRound}
            status={customer.openOrders > 0 ? <Badge tone="info">{customer.openOrders} open</Badge> : <Badge tone="neutral">No open orders</Badge>}
            footer={
                <Link
                    to={`/orders?search=${encodeURIComponent(customer.email || customer.phone || customer.name)}`}
                    className="btn btn-ghost btn-sm"
                    aria-label={`View orders of ${customer.name}`}
                >
                    <ShoppingCart size={14} aria-hidden="true" /> View orders
                </Link>
            }
        >
            <CardFields>
                <CardField label="Orders" value={formatNumber(customer.orderCount)} strong />
                <CardField label="Total spent" value={formatCurrency(customer.totalSpent)} strong />
                <CardField label="Last order" value={`${customer.lastOrderNumber} · ${formatDate(customer.lastOrderAt)}`} wide />
                <CardField label="Customer since" value={formatDate(customer.firstOrderAt)} />
                <CardField label="Phone" value={customer.phone || "—"} />
            </CardFields>
            {customer.address && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-base-content/60">
                    <MapPin size={14} className="mt-px shrink-0" aria-hidden="true" />
                    {customer.address}
                </p>
            )}
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Customers" description="Everyone who has ordered from you, with their order history." />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search name, email or phone…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Sort by" value={filters.sort} onChange={(value) => setFilter("sort", value)}>
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="customers"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={UserRound}
                emptyMessage="Customers appear here after their first order."
                renderItem={renderCustomer}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="customers" />

            <p className="mt-6 flex items-center gap-2 text-xs text-base-content/55">
                <Mail size={14} aria-hidden="true" />
                <Phone size={14} aria-hidden="true" />
                Customer details come from their orders. To change them, edit a pending order.
            </p>
        </>
    );
};

export default CustomersPage;

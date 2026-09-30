import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Eye, FileText, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { canEdit } from "../../utils/navigation";
import { ROLES } from "../../utils/roles";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "../../utils/format";
import { PURCHASE_STATUS_STYLES } from "../../utils/purchaseStatus";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "amount_high", label: "Amount: high to low" },
    { value: "amount_low", label: "Amount: low to high" }
];

const INITIAL_FILTERS = { search: "", status: "", supplier: "", warehouse: "", sort: "newest" };

// Purchase orders. Admins and managers see all of them; a supplier user sees only their own
// company's orders that were sent to them (the backend enforces that).
const PurchasesPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const isSupplier = role === ROLES.SUPPLIER;
    const mayEdit = canEdit("purchases", role);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    // Suppliers may not list suppliers or warehouses (403), so those filters are for staff only
    const suppliers = useOptions("/suppliers", "suppliers", {}, !isSupplier);
    const warehouses = useOptions("/warehouses", "warehouses", {}, !isSupplier);

    const { items, pagination, isLoading, error, reload } = useList("/purchases", "purchases", {
        ...filters,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE
    });

    const newPurchaseButton = mayEdit && (
        <Link to="/purchases/new" className="btn btn-primary">
            <Plus size={16} aria-hidden="true" /> New purchase order
        </Link>
    );

    const renderPurchase = (purchase) => {
        const unitsOrdered = (purchase.items || []).reduce((sum, item) => sum + item.quantityOrdered, 0);
        const unitsReceived = (purchase.items || []).reduce((sum, item) => sum + item.quantityReceived, 0);

        return (
            <RecordCard
                key={purchase._id}
                label={purchase.poNumber}
                title={isSupplier ? `Deliver to ${purchase.warehouse?.name}` : purchase.supplier?.name}
                titleTo={`/purchases/${purchase._id}`}
                code={purchase.poNumber}
                subtitle={formatDateTime(purchase.createdAt)}
                icon={FileText}
                status={<StatusBadge status={purchase.status} styles={PURCHASE_STATUS_STYLES} />}
                footer={
                    <Link to={`/purchases/${purchase._id}`} className="btn btn-sm" aria-label={`View ${purchase.poNumber}`}>
                        <Eye size={14} aria-hidden="true" /> View
                    </Link>
                }
            >
                <CardFields>
                    <CardField label="Total" value={formatCurrency(purchase.totalAmount)} strong />
                    <CardField label="Items" value={`${(purchase.items || []).length} product(s)`} />
                    {!isSupplier && <CardField label="Deliver to" value={purchase.warehouse?.name || "—"} />}
                    <CardField label="Received" value={`${formatNumber(unitsReceived)} / ${formatNumber(unitsOrdered)} units`} />
                    <CardField label="Expected" value={formatDate(purchase.expectedDeliveryDate)} />
                    {!isSupplier && <CardField label="Requested by" value={purchase.requestedBy?.name || "—"} />}
                </CardFields>
            </RecordCard>
        );
    };

    return (
        <>
            <PageHeader
                title={isSupplier ? "My purchase orders" : "Purchase orders"}
                description={isSupplier ? "Orders your buyer has sent to you." : "Stock you order from suppliers."}
            >
                {newPurchaseButton}
            </PageHeader>

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder={isSupplier ? "Search PO number…" : "Search PO number or supplier…"}
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    {Object.entries(PURCHASE_STATUS_STYLES).map(([value, style]) => (
                        <option key={value} value={value}>
                            {style.label}
                        </option>
                    ))}
                </FilterSelect>
                {!isSupplier && (
                    <>
                        <FilterSelect label="Supplier" value={filters.supplier} onChange={(value) => setFilter("supplier", value)}>
                            <option value="">All suppliers</option>
                            {suppliers.map((item) => (
                                <option key={item._id} value={item._id}>
                                    {item.name}
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
                    </>
                )}
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
                noun="purchase orders"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={FileText}
                emptyMessage={isSupplier ? "Purchase orders sent to your company will appear here." : "Raise a purchase order to restock from a supplier."}
                renderItem={renderPurchase}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="purchase orders" />
        </>
    );
};

export default PurchasesPage;

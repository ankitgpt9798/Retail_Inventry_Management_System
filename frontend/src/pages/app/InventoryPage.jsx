import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Boxes, History, Minus, Pencil, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import StockMovementForm from "../../components/inventory/StockMovementForm";
import ReorderLevelForm from "../../components/inventory/ReorderLevelForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatNumber } from "../../utils/format";
import { getStockStatus, STOCK_STATUS_STYLES } from "../../utils/statusStyles";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "updated", label: "Recently updated" },
    { value: "stock_low", label: "Stock: low to high" },
    { value: "stock_high", label: "Stock: high to low" }
];

// "BELOW_REORDER" = the backend's ?lowStock=true (low AND out of stock together); the others are ?stockStatus=
const STOCK_FILTERS = [
    { value: "BELOW_REORDER", label: "Below reorder level" },
    ...Object.entries(STOCK_STATUS_STYLES).map(([value, style]) => ({ value, label: style.label }))
];

// Card stripe colour for records that need attention
const ACCENT_BY_STATUS = { LOW_STOCK: "warning", OUT_OF_STOCK: "error" };

const INITIAL_FILTERS = { search: "", warehouse: "", category: "", stock: "", sort: "updated" };

// The stock catalog: one card per product per warehouse
const InventoryPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("inventory", role);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    // Which pop-up is open: { type: "in" | "out" | "reorder", inventory (a card's record, or null) }
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState("");

    // Drop-down choices. Only ACTIVE products/warehouses can receive or lose stock.
    const products = useOptions("/products", "products", { status: "ACTIVE" });
    const warehouses = useOptions("/warehouses", "warehouses");
    const categories = useOptions("/categories", "categories");
    const activeWarehouses = warehouses.filter((item) => item.status === "ACTIVE");

    const { items, pagination, isLoading, error, reload } = useList("/inventory", "inventories", {
        search: debouncedSearch,
        warehouse: filters.warehouse,
        category: filters.category,
        lowStock: filters.stock === "BELOW_REORDER" ? "true" : "",
        stockStatus: filters.stock !== "BELOW_REORDER" ? filters.stock : "",
        sort: filters.sort,
        page,
        limit: PAGE_SIZE
    });

    const closeDialog = () => setDialog(null);

    const handleSaved = (message) => {
        closeDialog();
        setNotice(message);
        reload();
    };

    const renderInventory = (inventory) => {
        const { product, warehouse } = inventory;
        const stockStatus = getStockStatus(inventory);
        const where = `${product.name} in ${warehouse.name}`;

        return (
            <RecordCard
                key={inventory._id}
                label={`${product.name} · ${warehouse.code}`}
                title={product.name}
                code={product.sku}
                subtitle={[product.brand, product.category?.name].filter(Boolean).join(" · ") || undefined}
                icon={Boxes}
                accent={ACCENT_BY_STATUS[stockStatus]}
                status={<StatusBadge status={stockStatus} styles={STOCK_STATUS_STYLES} />}
                footer={
                    mayEdit && (
                        <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ type: "in", inventory })} aria-label={`Add stock to ${where}`}>
                                <Plus size={14} aria-hidden="true" /> In
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ type: "out", inventory })} aria-label={`Remove stock from ${where}`}>
                                <Minus size={14} aria-hidden="true" /> Out
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ type: "reorder", inventory })} aria-label={`Edit reorder level of ${where}`}>
                                <Pencil size={14} aria-hidden="true" /> Reorder level
                            </button>
                        </>
                    )
                }
            >
                <CardFields>
                    <CardField label="Warehouse" value={`${warehouse.name} (${warehouse.code})`} wide />
                    <CardField label="Current stock" value={formatNumber(inventory.quantity)} strong />
                    <CardField
                        label="Available"
                        value={formatNumber(inventory.availableQuantity)}
                        strong
                        tone={stockStatus === "OUT_OF_STOCK" ? "error" : stockStatus === "LOW_STOCK" ? "warning" : undefined}
                    />
                    <CardField label="Reserved" value={formatNumber(inventory.reservedQuantity)} />
                    <CardField label="Minimum (reorder)" value={formatNumber(inventory.reorderLevel)} />
                    <CardField label="Cost" value={formatCurrency(product.costPrice)} />
                    <CardField label="Selling price" value={formatCurrency(product.sellingPrice)} />
                    <CardField label="Stock value (at cost)" value={formatCurrency(inventory.quantity * (product.costPrice || 0))} wide strong />
                </CardFields>
            </RecordCard>
        );
    };

    return (
        <>
            <PageHeader title="Inventory" description="The stock catalog: every product in every warehouse.">
                <Link to="/inventory/history" className="btn">
                    <History size={16} aria-hidden="true" /> Stock history
                </Link>
                {mayEdit && (
                    <>
                        <button type="button" className="btn" onClick={() => setDialog({ type: "out", inventory: null })}>
                            <Minus size={16} aria-hidden="true" /> Stock out
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "in", inventory: null })}>
                            <Plus size={16} aria-hidden="true" /> Stock in
                        </button>
                    </>
                )}
            </PageHeader>

            <PageAlerts notice={notice} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search product, SKU or brand…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Warehouse" value={filters.warehouse} onChange={(value) => setFilter("warehouse", value)}>
                    <option value="">All warehouses</option>
                    {warehouses.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Category" value={filters.category} onChange={(value) => setFilter("category", value)}>
                    <option value="">All categories</option>
                    {categories.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Stock status" value={filters.stock} onChange={(value) => setFilter("stock", value)}>
                    <option value="">All stock levels</option>
                    {STOCK_FILTERS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
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
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="stock records"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={Boxes}
                emptyTitle="No stock yet"
                emptyMessage="Use Stock in to put a product into a warehouse."
                renderItem={renderInventory}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="stock records" />

            {(dialog?.type === "in" || dialog?.type === "out") && (
                <Modal title={dialog.type === "in" ? "Stock in" : "Stock out"} onClose={closeDialog}>
                    <StockMovementForm
                        mode={dialog.type}
                        preset={dialog.inventory}
                        products={products}
                        warehouses={activeWarehouses}
                        onSaved={handleSaved}
                        onClose={closeDialog}
                    />
                </Modal>
            )}
            {dialog?.type === "reorder" && (
                <Modal title="Reorder level" onClose={closeDialog}>
                    <ReorderLevelForm inventory={dialog.inventory} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
        </>
    );
};

export default InventoryPage;

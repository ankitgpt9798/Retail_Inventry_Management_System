import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Boxes, Package, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import RecordActions from "../../components/common/RecordActions";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ProductForm from "../../components/catalog/ProductForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "name", label: "Name A–Z" },
    { value: "price_low", label: "Price: low to high" },
    { value: "price_high", label: "Price: high to low" }
];

const INITIAL_FILTERS = { search: "", category: "", status: "", sort: "newest" };

// Profit on one unit, as a % of the selling price
const marginPercent = (product) =>
    product.sellingPrice > 0 ? Math.round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100) : 0;

const ProductsPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("products", role);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "deactivate", product }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    // Categories fill the filter drop-down and the form (every page of them, not just the first 100).
    // If they can't be loaded the products list still works without them.
    const categories = useOptions("/categories", "categories");

    const { items, pagination, isLoading, error, reload } = useList("/products", "products", {
        ...filters,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE
    });

    const closeDialog = () => setDialog(null);

    const handleSaved = (message) => {
        closeDialog();
        setNotice(message);
        reload();
    };

    const handleDeactivate = async () => {
        await api.delete(`/products/${dialog.product._id}`);
        handleSaved("Product deactivated.");
    };

    const handleReactivate = async (product) => {
        setActionError("");
        try {
            await api.put(`/products/${product._id}`, { status: "ACTIVE" });
            setNotice("Product reactivated.");
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not reactivate the product"));
        }
    };

    const newProductButton = mayEdit && (
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", product: null })}>
            <Plus size={16} aria-hidden="true" /> New product
        </button>
    );

    const renderProduct = (product) => (
        <RecordCard
            key={product._id}
            label={product.name}
            title={product.name}
            code={product.sku}
            subtitle={product.brand || "No brand"}
            icon={Package}
            status={<StatusBadge status={product.status} />}
            footer={
                <>
                    <Link to={`/inventory?search=${encodeURIComponent(product.sku)}`} className="btn btn-ghost btn-sm" aria-label={`View stock of ${product.name}`}>
                        <Boxes size={14} aria-hidden="true" /> Stock
                    </Link>
                    {mayEdit && (
                        <RecordActions
                            name={product.name}
                            isActive={product.status === "ACTIVE"}
                            onEdit={() => setDialog({ type: "form", product })}
                            onDeactivate={() => setDialog({ type: "deactivate", product })}
                            onReactivate={() => handleReactivate(product)}
                        />
                    )}
                </>
            }
        >
            <CardFields>
                <CardField label="Category" value={product.category?.name || "—"} />
                <CardField label="Tax" value={`${product.taxRate ?? 0}%`} />
                <CardField label="Cost price" value={formatCurrency(product.costPrice)} />
                <CardField label="Selling price" value={formatCurrency(product.sellingPrice)} strong />
                <CardField label="Margin" value={`${marginPercent(product)}%`} tone={marginPercent(product) > 0 ? "success" : undefined} />
                <CardField label="Reorder level" value={formatNumber(product.reorderLevel)} />
            </CardFields>
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Products" description="Everything you stock and sell.">
                {newProductButton}
            </PageHeader>

            <PageAlerts notice={notice} error={actionError} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search name, SKU, brand…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Category" value={filters.category} onChange={(value) => setFilter("category", value)}>
                    <option value="">All categories</option>
                    {categories.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
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
                noun="products"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={Package}
                emptyMessage={mayEdit ? "Add your first product to start tracking stock." : "Products added by an administrator will appear here."}
                renderItem={renderProduct}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="products" />

            {dialog?.type === "form" && (
                <Modal title={dialog.product ? "Edit product" : "New product"} onClose={closeDialog} wide>
                    <ProductForm product={dialog.product} categories={categories} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "deactivate" && (
                <ConfirmModal
                    title="Deactivate product?"
                    message={`"${dialog.product.name}" will no longer be available for new stock, orders or purchases. You can reactivate it later.`}
                    confirmLabel="Deactivate"
                    onConfirm={handleDeactivate}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default ProductsPage;

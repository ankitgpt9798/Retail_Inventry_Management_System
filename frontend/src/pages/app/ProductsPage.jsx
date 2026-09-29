import { useState } from "react";
import { useSelector } from "react-redux";
import { Pencil, Plus, Power, RotateCcw } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import ProductForm from "../../components/catalog/ProductForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatCurrency } from "../../utils/format";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "name", label: "Name A–Z" },
    { value: "price_low", label: "Price: low to high" },
    { value: "price_high", label: "Price: high to low" }
];

const ProductsPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("products", role);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [category, setCategory] = useState("");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "deactivate", product }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    // Categories fill the filter drop-down and the form (every page of them, not just the first 100).
    // If they can't be loaded the products list still works without them.
    const categories = useOptions("/categories", "categories");

    const { items, pagination, isLoading, error, reload } = useList("/products", "products", {
        search: debouncedSearch,
        status,
        category,
        sort,
        page,
        limit: PAGE_SIZE
    });

    // Changing any filter goes back to page 1
    const withPageReset = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

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

    return (
        <>
            <PageHeader title="Products" description="Everything you stock and sell.">
                {mayEdit && (
                    <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", product: null })}>
                        <Plus size={16} aria-hidden="true" /> New product
                    </button>
                )}
            </PageHeader>

            {notice && (
                <div role="status" className="alert alert-success alert-soft mb-4">
                    {notice}
                </div>
            )}
            {actionError && (
                <div className="mb-4">
                    <ErrorAlert message={actionError} />
                </div>
            )}

            <div className="card border border-base-300 bg-base-100">
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Search name, SKU, brand…">
                    <FilterSelect label="Category" value={category} onChange={withPageReset(setCategory)}>
                        <option value="">All categories</option>
                        {categories.map((item) => (
                            <option key={item._id} value={item._id}>
                                {item.name}
                            </option>
                        ))}
                    </FilterSelect>
                    <FilterSelect label="Status" value={status} onChange={withPageReset(setStatus)}>
                        <option value="">All statuses</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                    </FilterSelect>
                    <FilterSelect label="Sort by" value={sort} onChange={withPageReset(setSort)}>
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </FilterSelect>
                </ListToolbar>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading products…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No products found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th>Category</th>
                                    <th className="text-right">Cost</th>
                                    <th className="text-right">Price</th>
                                    <th>Status</th>
                                    {mayEdit && <th className="text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((product) => (
                                    <tr key={product._id}>
                                        <td>
                                            <div className="font-medium">{product.name}</div>
                                            {product.brand && <div className="text-xs text-base-content/60">{product.brand}</div>}
                                        </td>
                                        <td className="font-mono text-sm">{product.sku}</td>
                                        <td>{product.category?.name || "—"}</td>
                                        <td className="text-right">{formatCurrency(product.costPrice)}</td>
                                        <td className="text-right">{formatCurrency(product.sellingPrice)}</td>
                                        <td><StatusBadge status={product.status} /></td>
                                        {mayEdit && (
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "form", product })}
                                                        aria-label={`Edit ${product.name}`}
                                                    >
                                                        <Pencil size={14} aria-hidden="true" /> Edit
                                                    </button>
                                                    {product.status === "ACTIVE" ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm text-error"
                                                            onClick={() => setDialog({ type: "deactivate", product })}
                                                            aria-label={`Deactivate ${product.name}`}
                                                        >
                                                            <Power size={14} aria-hidden="true" /> Deactivate
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleReactivate(product)}
                                                            aria-label={`Reactivate ${product.name}`}
                                                        >
                                                            <RotateCcw size={14} aria-hidden="true" /> Reactivate
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>

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

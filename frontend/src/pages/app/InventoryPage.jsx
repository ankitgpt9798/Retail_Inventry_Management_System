import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { History, Minus, Pencil, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import Modal from "../../components/common/Modal";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import StockMovementForm from "../../components/inventory/StockMovementForm";
import ReorderLevelForm from "../../components/inventory/ReorderLevelForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { canEdit } from "../../utils/navigation";
import { formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

// Same rule as the backend: low stock = available (on hand − reserved) is below the reorder level
const isLowStock = (inventory) => inventory.availableQuantity < inventory.reorderLevel;

const InventoryPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("inventory", role);

    const [search, setSearch] = useState("");
    const [warehouse, setWarehouse] = useState("");
    const [onlyLow, setOnlyLow] = useState(false);
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    // Which pop-up is open: { type: "in" | "out" | "reorder", inventory (a row, or null) }
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState("");

    // Drop-down choices. Only ACTIVE products/warehouses can receive or lose stock.
    const products = useOptions("/products", "products", { status: "ACTIVE" });
    const warehouses = useOptions("/warehouses", "warehouses");
    const activeWarehouses = warehouses.filter((item) => item.status === "ACTIVE");

    const { items, pagination, isLoading, error, reload } = useList("/inventory", "inventories", {
        search: debouncedSearch,
        warehouse,
        lowStock: onlyLow ? "true" : "",
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

    return (
        <>
            <PageHeader title="Inventory" description="Stock of every product in every warehouse.">
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

            {notice && (
                <div role="status" className="alert alert-success alert-soft mb-4">
                    {notice}
                </div>
            )}

            <div className="card border border-base-300 bg-base-100">
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Search product name or SKU…">
                    <FilterSelect label="Warehouse" value={warehouse} onChange={withPageReset(setWarehouse)}>
                        <option value="">All warehouses</option>
                        {warehouses.map((item) => (
                            <option key={item._id} value={item._id}>
                                {item.name}
                            </option>
                        ))}
                    </FilterSelect>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={onlyLow}
                            onChange={(event) => withPageReset(setOnlyLow)(event.target.checked)}
                        />
                        Low stock only
                    </label>
                </ListToolbar>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading inventory…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">
                        {onlyLow ? "No products are low on stock." : "No stock records found."}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Warehouse</th>
                                    <th className="text-right">On hand</th>
                                    <th className="text-right">Reserved</th>
                                    <th className="text-right">Available</th>
                                    <th className="text-right">Reorder level</th>
                                    {mayEdit && <th className="text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((inventory) => (
                                    <tr key={inventory._id}>
                                        <td>
                                            <div className="font-medium">{inventory.product.name}</div>
                                            <div className="font-mono text-xs text-base-content/60">{inventory.product.sku}</div>
                                        </td>
                                        <td>{inventory.warehouse.name}</td>
                                        <td className="text-right">{formatNumber(inventory.quantity)}</td>
                                        <td className="text-right">{formatNumber(inventory.reservedQuantity)}</td>
                                        <td className="text-right font-medium">
                                            {formatNumber(inventory.availableQuantity)}
                                            {isLowStock(inventory) && (
                                                <span className="badge badge-warning badge-soft badge-sm ml-2">Low stock</span>
                                            )}
                                        </td>
                                        <td className="text-right">{formatNumber(inventory.reorderLevel)}</td>
                                        {mayEdit && (
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "in", inventory })}
                                                        aria-label={`Add stock to ${inventory.product.name} in ${inventory.warehouse.name}`}
                                                    >
                                                        <Plus size={14} aria-hidden="true" /> In
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "out", inventory })}
                                                        aria-label={`Remove stock from ${inventory.product.name} in ${inventory.warehouse.name}`}
                                                    >
                                                        <Minus size={14} aria-hidden="true" /> Out
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "reorder", inventory })}
                                                        aria-label={`Edit reorder level of ${inventory.product.name} in ${inventory.warehouse.name}`}
                                                    >
                                                        <Pencil size={14} aria-hidden="true" />
                                                    </button>
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

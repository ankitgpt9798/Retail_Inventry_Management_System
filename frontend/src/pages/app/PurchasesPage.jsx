import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import PurchaseStatusBadge from "../../components/purchases/PurchaseStatusBadge";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { canEdit } from "../../utils/navigation";
import { ROLES } from "../../utils/roles";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { PURCHASE_STATUS_STYLES } from "../../utils/purchaseStatus";

const PAGE_SIZE = 10;

// Purchase orders. Admins and managers see all of them; a supplier user sees only their own
// company's orders that were sent to them (the backend enforces that).
const PurchasesPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const isSupplier = role === ROLES.SUPPLIER;
    const mayEdit = canEdit("purchases", role);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [supplier, setSupplier] = useState("");
    const [warehouse, setWarehouse] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    // Suppliers may not list suppliers or warehouses (403), so those filters are for staff only
    const suppliers = useOptions("/suppliers", "suppliers", {}, !isSupplier);
    const warehouses = useOptions("/warehouses", "warehouses", {}, !isSupplier);

    const { items, pagination, isLoading, error, reload } = useList("/purchases", "purchases", {
        search: debouncedSearch,
        status,
        supplier,
        warehouse,
        page,
        limit: PAGE_SIZE
    });

    const withPageReset = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

    return (
        <>
            <PageHeader
                title={isSupplier ? "My purchase orders" : "Purchase orders"}
                description={isSupplier ? "Orders your buyer has sent to you." : "Stock you order from suppliers."}
            >
                {mayEdit && (
                    <Link to="/purchases/new" className="btn btn-primary">
                        <Plus size={16} aria-hidden="true" /> New purchase order
                    </Link>
                )}
            </PageHeader>

            <div className="card border border-base-300 bg-base-100">
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Search PO number…">
                    <FilterSelect label="Status" value={status} onChange={withPageReset(setStatus)}>
                        <option value="">All statuses</option>
                        {Object.entries(PURCHASE_STATUS_STYLES).map(([value, style]) => (
                            <option key={value} value={value}>
                                {style.label}
                            </option>
                        ))}
                    </FilterSelect>
                    {!isSupplier && (
                        <>
                            <FilterSelect label="Supplier" value={supplier} onChange={withPageReset(setSupplier)}>
                                <option value="">All suppliers</option>
                                {suppliers.map((item) => (
                                    <option key={item._id} value={item._id}>
                                        {item.name}
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
                        </>
                    )}
                </ListToolbar>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading purchase orders…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No purchase orders found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>PO number</th>
                                    {!isSupplier && <th>Supplier</th>}
                                    <th>Deliver to</th>
                                    <th>Status</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((purchase) => (
                                    <tr key={purchase._id}>
                                        <td>
                                            <div className="font-mono text-sm font-medium">{purchase.poNumber}</div>
                                            <div className="text-xs text-base-content/60">{formatDateTime(purchase.createdAt)}</div>
                                        </td>
                                        {!isSupplier && <td>{purchase.supplier?.name}</td>}
                                        <td>{purchase.warehouse?.name}</td>
                                        <td><PurchaseStatusBadge status={purchase.status} /></td>
                                        <td className="text-right">{formatCurrency(purchase.totalAmount)}</td>
                                        <td className="text-right">
                                            <Link to={`/purchases/${purchase._id}`} className="btn btn-ghost btn-sm" aria-label={`View ${purchase.poNumber}`}>
                                                View
                                            </Link>
                                        </td>
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

export default PurchasesPage;

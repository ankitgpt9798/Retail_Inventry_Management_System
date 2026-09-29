import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { ORDER_STATUS_STYLES } from "../../utils/orderStatus";

const PAGE_SIZE = 10;

const OrdersPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("orders", role);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [warehouse, setWarehouse] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    const warehouses = useOptions("/warehouses", "warehouses");

    // "to" is sent as the END of its day, otherwise orders placed that day would be left out
    const { items, pagination, isLoading, error, reload } = useList("/orders", "orders", {
        search: debouncedSearch,
        status,
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
            <PageHeader title="Orders" description="Customer orders, from pending to delivered.">
                {mayEdit && (
                    <Link to="/orders/new" className="btn btn-primary">
                        <Plus size={16} aria-hidden="true" /> New order
                    </Link>
                )}
            </PageHeader>

            <div className="card border border-base-300 bg-base-100">
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Order number, customer or phone…">
                    <FilterSelect label="Status" value={status} onChange={withPageReset(setStatus)}>
                        <option value="">All statuses</option>
                        {Object.entries(ORDER_STATUS_STYLES).map(([value, style]) => (
                            <option key={value} value={value}>
                                {style.label}
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
                        <input type="date" className="input" value={from} max={to || undefined} onChange={(event) => withPageReset(setFrom)(event.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        To
                        <input type="date" className="input" value={to} min={from || undefined} onChange={(event) => withPageReset(setTo)(event.target.value)} />
                    </label>
                </ListToolbar>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading orders…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No orders found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Customer</th>
                                    <th>Warehouse</th>
                                    <th>Status</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((order) => (
                                    <tr key={order._id}>
                                        <td>
                                            <div className="font-mono text-sm font-medium">{order.orderNumber}</div>
                                            <div className="text-xs text-base-content/60">{formatDateTime(order.createdAt)}</div>
                                        </td>
                                        <td>{order.customer?.name}</td>
                                        <td>{order.warehouse?.code}</td>
                                        <td><OrderStatusBadge status={order.status} /></td>
                                        <td className="text-right">{formatCurrency(order.totalAmount)}</td>
                                        <td className="text-right">
                                            <Link to={`/orders/${order._id}`} className="btn btn-ghost btn-sm" aria-label={`View ${order.orderNumber}`}>
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

export default OrdersPage;

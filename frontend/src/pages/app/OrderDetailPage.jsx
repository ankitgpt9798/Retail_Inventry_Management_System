import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ErrorAlert from "../../components/common/ErrorAlert";
import PageAlerts from "../../components/common/PageAlerts";
import Loader from "../../components/common/Loader";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import OrderActions from "../../components/orders/OrderActions";
import PaymentStatusForm from "../../components/orders/PaymentStatusForm";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatDateTime, formatNumber } from "../../utils/format";

const OrderDetailPage = () => {
    const { id } = useParams();
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("orders", role);

    const [data, setData] = useState(null); // { order, items }
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        setError("");
        try {
            const response = await api.get(`/orders/${id}`);
            setData(response.data.data);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not load the order"));
        }
        finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    // After any change: show the message and load the fresh order (new status, new timeline)
    const handleDone = (message) => {
        setNotice(message);
        load();
    };

    if (isLoading) return <Loader text="Loading order…" />;
    if (error && !data) {
        return (
            <>
                <ErrorAlert message={error} onRetry={load} />
                <Link to="/orders" className="btn mt-4">
                    <ArrowLeft size={16} aria-hidden="true" /> Back to orders
                </Link>
            </>
        );
    }

    const { order, items } = data;

    return (
        <>
            <PageHeader title={order.orderNumber} description={`Placed ${formatDateTime(order.createdAt)} by ${order.createdBy?.name || "—"}`}>
                <Link to="/orders" className="btn">
                    <ArrowLeft size={16} aria-hidden="true" /> All orders
                </Link>
            </PageHeader>

            <PageAlerts notice={notice} onDismissNotice={() => setNotice("")} />

            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-base-300 bg-base-100 p-4 shadow-card">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-base-content/70">Status</span>
                    <OrderStatusBadge status={order.status} />
                </div>
                {mayEdit && <OrderActions order={order} onDone={handleDone} />}
            </div>

            <div className="grid gap-6 *:min-w-0 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <div className="card">
                        <div className="card-body">
                            <h2 className="card-title">Items</h2>
                            <div className="overflow-x-auto">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th className="text-right">Price</th>
                                            <th className="text-right">Qty</th>
                                            <th className="text-right">Tax</th>
                                            <th className="text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => (
                                            <tr key={item._id}>
                                                <td>
                                                    <div className="font-medium">{item.productName}</div>
                                                    <div className="font-mono text-xs text-base-content/60">{item.sku}</div>
                                                </td>
                                                <td className="text-right">{formatCurrency(item.unitPrice)}</td>
                                                <td className="text-right">{formatNumber(item.quantity)}</td>
                                                <td className="text-right">{formatCurrency(item.lineTax)}</td>
                                                <td className="text-right">{formatCurrency(item.lineTotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <dl className="ml-auto mt-2 w-full max-w-xs space-y-1 text-sm">
                                <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal)}</dd></div>
                                <div className="flex justify-between"><dt>Tax</dt><dd>{formatCurrency(order.taxAmount)}</dd></div>
                                <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatCurrency(order.totalAmount)}</dd></div>
                            </dl>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-body">
                            <h2 className="card-title">Timeline</h2>
                            <ol className="mt-2 space-y-4 border-l-2 border-base-300 pl-5">
                                {(order.statusHistory || []).map((entry, index) => (
                                    <li key={index} className="relative flex flex-wrap items-start gap-3">
                                        <span className="absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-base-100 bg-primary" aria-hidden="true"></span>
                                        <OrderStatusBadge status={entry.status} />
                                        <div className="text-sm">
                                            <div>
                                                {formatDateTime(entry.changedAt)}
                                                {entry.changedBy?.name && ` · ${entry.changedBy.name}`}
                                            </div>
                                            {entry.note && <div className="text-base-content/70">{entry.note}</div>}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="card">
                        <div className="card-body">
                            <h2 className="card-title">Payment</h2>
                            <PaymentStatusForm key={order.paymentStatus} order={order} mayEdit={mayEdit} onDone={handleDone} />
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-body">
                            <h2 className="card-title">Customer</h2>
                            <dl className="space-y-2 text-sm">
                                <div><dt className="text-base-content/60">Name</dt><dd className="font-medium">{order.customer?.name}</dd></div>
                                {order.customer?.email && <div><dt className="text-base-content/60">Email</dt><dd>{order.customer.email}</dd></div>}
                                {order.customer?.phone && <div><dt className="text-base-content/60">Phone</dt><dd>{order.customer.phone}</dd></div>}
                                {order.customer?.address && <div><dt className="text-base-content/60">Address</dt><dd>{order.customer.address}</dd></div>}
                            </dl>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-body">
                            <h2 className="card-title">Fulfillment</h2>
                            <dl className="space-y-2 text-sm">
                                <div><dt className="text-base-content/60">Warehouse</dt><dd className="font-medium">{order.warehouse?.name} ({order.warehouse?.code})</dd></div>
                                {order.carrier && <div><dt className="text-base-content/60">Carrier</dt><dd>{order.carrier}</dd></div>}
                                {order.trackingNumber && <div><dt className="text-base-content/60">Tracking number</dt><dd className="font-mono">{order.trackingNumber}</dd></div>}
                                {order.notes && <div><dt className="text-base-content/60">Notes</dt><dd>{order.notes}</dd></div>}
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default OrderDetailPage;

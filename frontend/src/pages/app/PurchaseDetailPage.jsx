import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import PurchaseStatusBadge from "../../components/purchases/PurchaseStatusBadge";
import PurchaseActions from "../../components/purchases/PurchaseActions";
import api, { getErrorMessage } from "../../services/api";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "../../utils/format";

// The key moments of a purchase order, oldest first. Only the ones that happened are shown.
const buildTimeline = (purchase) => {
    const steps = [
        { label: "Created", at: purchase.createdAt, by: purchase.requestedBy?.name },
        { label: "Approved", at: purchase.approvedAt, by: purchase.approvedBy?.name },
        { label: "Rejected", at: purchase.rejectedAt, by: purchase.rejectedBy?.name, note: purchase.rejectionReason },
        { label: "Sent to supplier", at: purchase.orderedAt, by: purchase.orderedBy?.name },
        { label: "Confirmed by supplier", at: purchase.supplierConfirmedAt, by: purchase.supplierConfirmedBy?.name },
        { label: "Fully received", at: purchase.receivedAt },
        { label: "Cancelled", at: purchase.cancelledAt, by: purchase.cancelledBy?.name, note: purchase.cancelReason }
    ];
    return steps.filter((step) => step.at);
};

const PurchaseDetailPage = () => {
    const { id } = useParams();

    const [purchase, setPurchase] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        setError("");
        try {
            const response = await api.get(`/purchases/${id}`);
            setPurchase(response.data.data.purchase);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not load the purchase order"));
        }
        finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    // After any change: show the message and load the fresh purchase order
    const handleDone = (message) => {
        setNotice(message);
        load();
    };

    if (isLoading) return <Loader text="Loading purchase order…" />;
    if (error && !purchase) {
        return (
            <>
                <ErrorAlert message={error} onRetry={load} />
                <Link to="/purchases" className="btn mt-4">
                    <ArrowLeft size={16} aria-hidden="true" /> Back to purchase orders
                </Link>
            </>
        );
    }

    const timeline = buildTimeline(purchase);

    return (
        <>
            <PageHeader title={purchase.poNumber} description={`Requested by ${purchase.requestedBy?.name || "—"}`}>
                <Link to="/purchases" className="btn">
                    <ArrowLeft size={16} aria-hidden="true" /> All purchase orders
                </Link>
            </PageHeader>

            {notice && (
                <div role="status" className="alert alert-success alert-soft mb-4">
                    {notice}
                </div>
            )}

            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 p-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-base-content/70">Status</span>
                    <PurchaseStatusBadge status={purchase.status} />
                </div>
                <PurchaseActions purchase={purchase} onDone={handleDone} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <div className="card border border-base-300 bg-base-100">
                        <div className="card-body">
                            <h2 className="card-title">Items</h2>
                            <div className="overflow-x-auto">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th className="text-right">Unit cost</th>
                                            <th className="text-right">Ordered</th>
                                            <th className="text-right">Received</th>
                                            <th className="text-right">Outstanding</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchase.items.map((item) => (
                                            <tr key={item._id || item.product?._id}>
                                                <td>
                                                    <div className="font-medium">{item.product?.name}</div>
                                                    <div className="font-mono text-xs text-base-content/60">{item.product?.sku}</div>
                                                </td>
                                                <td className="text-right">{formatCurrency(item.unitCost)}</td>
                                                <td className="text-right">{formatNumber(item.quantityOrdered)}</td>
                                                <td className="text-right">{formatNumber(item.quantityReceived)}</td>
                                                <td className="text-right">{formatNumber(item.quantityOutstanding ?? item.quantityOrdered - item.quantityReceived)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="ml-auto mt-2 flex w-full max-w-xs justify-between text-base font-bold">
                                <span>Total</span>
                                <span>{formatCurrency(purchase.totalAmount)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card border border-base-300 bg-base-100">
                        <div className="card-body">
                            <h2 className="card-title">Timeline</h2>
                            <ol className="space-y-3">
                                {timeline.map((step) => (
                                    <li key={step.label} className="text-sm">
                                        <div className="font-medium">{step.label}</div>
                                        <div className="text-base-content/70">
                                            {formatDateTime(step.at)}
                                            {step.by && ` · ${step.by}`}
                                        </div>
                                        {step.note && <div className="text-base-content/70">{step.note}</div>}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="card border border-base-300 bg-base-100">
                        <div className="card-body">
                            <h2 className="card-title">Details</h2>
                            <dl className="space-y-2 text-sm">
                                <div><dt className="text-base-content/60">Supplier</dt><dd className="font-medium">{purchase.supplier?.name}</dd></div>
                                <div><dt className="text-base-content/60">Deliver to</dt><dd className="font-medium">{purchase.warehouse?.name} ({purchase.warehouse?.code})</dd></div>
                                <div>
                                    <dt className="text-base-content/60">Expected delivery</dt>
                                    <dd>{formatDate(purchase.expectedDeliveryDate)}</dd>
                                </div>
                                {purchase.deliveryNote && <div><dt className="text-base-content/60">Supplier note</dt><dd>{purchase.deliveryNote}</dd></div>}
                                {purchase.notes && <div><dt className="text-base-content/60">Notes</dt><dd>{purchase.notes}</dd></div>}
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default PurchaseDetailPage;

import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import Pagination from "../../components/common/Pagination";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import OrderActions from "../../components/orders/OrderActions";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatNumber } from "../../utils/format";
import { FULFILLMENT_STAGES, ORDER_STATUS_STYLES } from "../../utils/orderStatus";

const PAGE_SIZE = 10;

// The warehouse's to-do list: how many orders wait at each stage, and the orders of one stage
// with a button for their next step.
const FulfillmentPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("fulfillment", role);

    const [stage, setStage] = useState("CONFIRMED");
    const [page, setPage] = useState(1);
    const [notice, setNotice] = useState("");

    // How many orders wait at each stage
    const [queue, setQueue] = useState(null);
    const [queueError, setQueueError] = useState("");
    const loadQueue = useCallback(async () => {
        setQueueError("");
        try {
            const response = await api.get("/orders/fulfillment-queue");
            setQueue(response.data.data.queue);
        }
        catch (err) {
            setQueueError(getErrorMessage(err, "Could not load the queue"));
        }
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const { items, pagination, isLoading, error, reload } = useList("/orders", "orders", {
        status: stage,
        page,
        limit: PAGE_SIZE
    });

    const chooseStage = (value) => {
        setStage(value);
        setPage(1);
        setNotice("");
    };

    // After a step: the order leaves this stage, so refresh both the counts and the list
    const handleDone = (message) => {
        setNotice(message);
        loadQueue();
        reload();
    };

    return (
        <>
            <PageHeader title="Fulfillment" description="Orders waiting to be processed, packed and shipped." />

            <ErrorAlert message={queueError} onRetry={loadQueue} />

            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {FULFILLMENT_STAGES.map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => chooseStage(value)}
                        aria-pressed={stage === value}
                        className={`card border bg-base-100 text-left transition-colors ${
                            stage === value ? "border-primary ring-1 ring-primary" : "border-base-300 hover:border-primary/50"
                        }`}
                    >
                        <div className="card-body p-4">
                            <span className="text-sm text-base-content/70">{ORDER_STATUS_STYLES[value].label}</span>
                            <span className="text-3xl font-bold" data-testid={`queue-${value}`}>
                                {queue ? formatNumber(queue[value] ?? 0) : "–"}
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            {notice && (
                <div role="status" className="alert alert-success alert-soft mb-4">
                    {notice}
                </div>
            )}

            <div className="card border border-base-300 bg-base-100">
                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading orders…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">
                        No {ORDER_STATUS_STYLES[stage].label.toLowerCase()} orders. Nothing to do here.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Customer</th>
                                    <th>Warehouse</th>
                                    <th className="text-right">Total</th>
                                    {mayEdit && <th className="text-right">Next step</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((order) => (
                                    <tr key={order._id}>
                                        <td>
                                            <Link to={`/orders/${order._id}`} className="link link-hover font-mono text-sm font-medium">
                                                {order.orderNumber}
                                            </Link>
                                        </td>
                                        <td>{order.customer?.name}</td>
                                        <td>{order.warehouse?.code}</td>
                                        <td className="text-right">{formatCurrency(order.totalAmount)}</td>
                                        {mayEdit && (
                                            <td>
                                                <OrderActions order={order} onDone={handleDone} compact />
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
        </>
    );
};

export default FulfillmentPage;

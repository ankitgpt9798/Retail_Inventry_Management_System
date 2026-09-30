import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Boxes, PackageCheck, PackageOpen, Truck } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ErrorAlert from "../../components/common/ErrorAlert";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import OrderActions from "../../components/orders/OrderActions";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatCurrency, formatDateTime, formatNumber } from "../../utils/format";
import { FULFILLMENT_STAGES, ORDER_STATUS_STYLES } from "../../utils/orderStatus";
import { PAYMENT_STATUS_STYLES } from "../../utils/statusStyles";

const PAGE_SIZE = 10;

const STAGE_ICONS = { CONFIRMED: PackageOpen, PROCESSING: Boxes, PACKED: PackageCheck, SHIPPED: Truck };

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

    const renderOrder = (order) => (
        <RecordCard
            key={order._id}
            label={order.orderNumber}
            title={order.customer?.name}
            titleTo={`/orders/${order._id}`}
            code={order.orderNumber}
            subtitle={formatDateTime(order.createdAt)}
            icon={STAGE_ICONS[order.status] || PackageOpen}
            status={<StatusBadge status={order.paymentStatus} styles={PAYMENT_STATUS_STYLES} />}
            footer={mayEdit && <OrderActions order={order} onDone={handleDone} compact />}
        >
            <CardFields>
                <CardField label="Warehouse" value={order.warehouse?.code || "—"} />
                <CardField label="Total" value={formatCurrency(order.totalAmount)} strong />
                {order.trackingNumber && <CardField label="Tracking" value={`${order.carrier || ""} ${order.trackingNumber}`.trim()} wide mono />}
            </CardFields>
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Fulfillment" description="Orders waiting to be processed, packed and shipped." />

            <ErrorAlert message={queueError} onRetry={loadQueue} className="mb-4" />

            {/* One button per stage, with how many orders wait there */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {FULFILLMENT_STAGES.map((value) => {
                    const Icon = STAGE_ICONS[value];
                    const selected = stage === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => chooseStage(value)}
                            aria-pressed={selected}
                            className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border bg-base-100 p-4 text-left shadow-card transition-colors ${
                                selected ? "border-primary ring-2 ring-primary/20" : "border-base-300 hover:border-primary/40"
                            }`}
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm text-base-content/65">{ORDER_STATUS_STYLES[value].label}</span>
                                <span className="text-2xl font-bold tabular-nums sm:text-3xl" data-testid={`queue-${value}`}>
                                    {queue ? formatNumber(queue[value] ?? 0) : "–"}
                                </span>
                            </span>
                            <span className={`hidden size-10 shrink-0 items-center justify-center rounded-lg sm:flex ${selected ? "bg-primary text-primary-content" : "bg-primary-soft text-primary"}`}>
                                <Icon size={20} aria-hidden="true" />
                            </span>
                        </button>
                    );
                })}
            </div>

            <PageAlerts notice={notice} onDismissNotice={() => setNotice("")} />

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="orders"
                emptyIcon={PackageCheck}
                emptyTitle={`No ${ORDER_STATUS_STYLES[stage].label.toLowerCase()} orders`}
                emptyMessage="Nothing to do here."
                renderItem={renderOrder}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="orders" />
        </>
    );
};

export default FulfillmentPage;

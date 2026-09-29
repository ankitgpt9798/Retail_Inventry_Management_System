import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import ConfirmModal from "../common/ConfirmModal";
import ReasonModal from "../common/ReasonModal";
import ErrorAlert from "../common/ErrorAlert";
import ShipOrderModal from "./ShipOrderModal";
import api, { getErrorMessage } from "../../services/api";
import { CANCELLABLE_STATUSES, NEXT_STEP } from "../../utils/orderStatus";

// The buttons for ONE order: its next step, Edit (pending only) and Cancel.
// Used on the order page and in the fulfillment queue, so the rules live in one place.
//   onDone(message): called after a successful change; the page then reloads its data
//   compact: smaller buttons, no Edit link (fulfillment queue rows)
const OrderActions = ({ order, onDone, compact = false }) => {
    const [dialog, setDialog] = useState(null); // "confirm" | "ship" | "cancel"
    const [error, setError] = useState("");

    const step = NEXT_STEP[order.status];
    const canCancel = CANCELLABLE_STATUSES.includes(order.status);
    const size = compact ? "btn-sm" : "";

    // Steps that need no extra input run straight away; failures show under the buttons
    const runStatusStep = async () => {
        setError("");
        try {
            await api.put(`/orders/${order._id}/status`, { status: step.status });
            onDone(`${order.orderNumber} is now ${step.status.toLowerCase()}.`);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not update the order"));
        }
    };

    const handleStepClick = () => {
        if (step.kind === "status") runStatusStep();
        else setDialog(step.kind); // "confirm" or "ship" open a pop-up first
    };

    const closeDialog = () => setDialog(null);

    if (!step && !canCancel) {
        return null; // DELIVERED or CANCELLED: nothing more to do
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap justify-end gap-2">
                {step && (
                    <button type="button" className={`btn btn-primary ${size}`} onClick={handleStepClick} aria-label={`${step.label} ${order.orderNumber}`}>
                        {step.label}
                    </button>
                )}
                {order.status === "PENDING" && !compact && (
                    <Link to={`/orders/${order._id}/edit`} className={`btn ${size}`}>
                        <Pencil size={14} aria-hidden="true" /> Edit
                    </Link>
                )}
                {canCancel && (
                    <button
                        type="button"
                        className={`btn btn-ghost text-error ${size}`}
                        onClick={() => setDialog("cancel")}
                        aria-label={`Cancel ${order.orderNumber}`}
                    >
                        Cancel order
                    </button>
                )}
            </div>
            <ErrorAlert message={error} />

            {dialog === "confirm" && (
                <ConfirmModal
                    title="Confirm order?"
                    message="The ordered quantities will be reserved in the warehouse. If there isn't enough available stock, the order stays pending."
                    confirmLabel="Confirm order"
                    confirmClass="btn-primary"
                    onConfirm={async () => {
                        await api.put(`/orders/${order._id}/confirm`);
                        closeDialog();
                        onDone(`${order.orderNumber} confirmed.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog === "ship" && (
                <ShipOrderModal
                    order={order}
                    onShipped={(message) => {
                        closeDialog();
                        onDone(message);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog === "cancel" && (
                <ReasonModal
                    title={`Cancel ${order.orderNumber}?`}
                    message="Any reserved stock is released again."
                    label="Reason (optional)"
                    confirmLabel="Cancel order"
                    onSubmit={async (reason) => {
                        // DELETE with a body: axios wants it under `data`
                        await api.delete(`/orders/${order._id}`, { data: reason ? { reason } : {} });
                        closeDialog();
                        onDone(`${order.orderNumber} cancelled.`);
                    }}
                    onClose={closeDialog}
                />
            )}
        </div>
    );
};

export default OrderActions;

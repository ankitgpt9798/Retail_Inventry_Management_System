import { useState } from "react";
import StatusBadge from "../common/StatusBadge";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { PAYMENT_STATUS_STYLES } from "../../utils/statusStyles";

// The order's payment status, and (for staff/admin) a drop-down to change it.
// Payment is separate from delivery, e.g. a DELIVERED order can still be "Payment pending".
//   PUT /api/orders/:id/payment { paymentStatus }
const PaymentStatusForm = ({ order, mayEdit, onDone }) => {
    const [value, setValue] = useState(order.paymentStatus);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        setError("");
        try {
            await api.put(`/orders/${order._id}/payment`, { paymentStatus: value });
            onDone(`${order.orderNumber} payment is now "${PAYMENT_STATUS_STYLES[value].label}".`);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not update the payment"));
        }
        finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-base-content/60">Current</span>
                <StatusBadge status={order.paymentStatus} styles={PAYMENT_STATUS_STYLES} />
            </div>
            {mayEdit && (
                <form onSubmit={save} className="flex gap-2">
                    <select className="select" aria-label="Payment status" value={value} onChange={(event) => setValue(event.target.value)}>
                        {Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => (
                            <option key={status} value={status}>
                                {style.label}
                            </option>
                        ))}
                    </select>
                    <button type="submit" className="btn btn-primary" disabled={isSaving || value === order.paymentStatus}>
                        {isSaving ? "Saving…" : "Update"}
                    </button>
                </form>
            )}
            <ErrorAlert message={error} />
        </div>
    );
};

export default PaymentStatusForm;

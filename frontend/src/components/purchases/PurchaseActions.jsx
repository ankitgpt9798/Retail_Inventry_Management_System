import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import ConfirmModal from "../common/ConfirmModal";
import ReasonModal from "../common/ReasonModal";
import ErrorAlert from "../common/ErrorAlert";
import ReceiveGoodsModal from "./ReceiveGoodsModal";
import SupplierDeliveryModal from "./SupplierDeliveryModal";
import api, { getErrorMessage } from "../../services/api";
import { ROLES } from "../../utils/roles";
import { CANCELLABLE_STATUSES, RECEIVABLE_STATUSES } from "../../utils/purchaseStatus";

// The buttons for ONE purchase order. What you see depends on the order's status AND on who you are:
//   admin / manager: run the workflow (submit, approve, reject, order, receive, cancel)
//   supplier:        confirm the order and update delivery details (portal)
//   onDone(message): called after a successful change; the page then reloads
const PurchaseActions = ({ purchase, onDone }) => {
    const user = useSelector((state) => state.auth.user);
    const [dialog, setDialog] = useState(null); // "reject" | "order" | "cancel" | "receive" | "confirm" | "delivery"
    const [error, setError] = useState("");

    const closeDialog = () => setDialog(null);
    const done = (message) => {
        closeDialog();
        onDone(message);
    };

    // A step that needs no extra input: call it and report any refusal under the buttons
    const runStep = async (action, message) => {
        setError("");
        try {
            await api.put(`/purchases/${purchase._id}/${action}`);
            onDone(message);
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not update the purchase order"));
        }
    };

    const { status, poNumber } = purchase;
    const buttons = [];

    // ---------- Supplier portal ----------
    if (user.role === ROLES.SUPPLIER) {
        if (status === "ORDERED" && !purchase.supplierConfirmedAt) {
            buttons.push(
                <button key="confirm" type="button" className="btn btn-primary" onClick={() => setDialog("confirm")}>
                    Confirm order
                </button>
            );
        }
        if (RECEIVABLE_STATUSES.includes(status)) {
            buttons.push(
                <button key="delivery" type="button" className="btn" onClick={() => setDialog("delivery")}>
                    Update delivery details
                </button>
            );
        }
    }
    // ---------- Admin / inventory manager ----------
    else {
        // The backend refuses approving your own request, so don't offer it
        const isOwnRequest = purchase.requestedBy?._id === user._id;

        if (status === "DRAFT") {
            buttons.push(
                <button key="submit" type="button" className="btn btn-primary" onClick={() => runStep("submit", `${poNumber} submitted for approval.`)}>
                    Submit for approval
                </button>,
                <Link key="edit" to={`/purchases/${purchase._id}/edit`} className="btn">
                    <Pencil size={14} aria-hidden="true" /> Edit
                </Link>
            );
        }
        if (status === "PENDING") {
            if (isOwnRequest) {
                buttons.push(<span key="own" className="self-center text-sm text-base-content/60">Needs another approver</span>);
            }
            else {
                buttons.push(
                    <button key="approve" type="button" className="btn btn-primary" onClick={() => runStep("approve", `${poNumber} approved.`)}>
                        Approve
                    </button>,
                    <button key="reject" type="button" className="btn btn-ghost text-error" onClick={() => setDialog("reject")}>
                        Reject
                    </button>
                );
            }
        }
        if (status === "APPROVED") {
            buttons.push(
                <button key="order" type="button" className="btn btn-primary" onClick={() => setDialog("order")}>
                    Mark as ordered
                </button>
            );
        }
        if (RECEIVABLE_STATUSES.includes(status)) {
            buttons.push(
                <button key="receive" type="button" className="btn btn-primary" onClick={() => setDialog("receive")}>
                    Receive goods
                </button>
            );
        }
        if (CANCELLABLE_STATUSES.includes(status)) {
            buttons.push(
                <button key="cancel" type="button" className="btn btn-ghost text-error" onClick={() => setDialog("cancel")}>
                    {status === "PARTIALLY_RECEIVED" ? "Cancel the rest" : "Cancel order"}
                </button>
            );
        }
    }

    if (buttons.length === 0 && !dialog) {
        return null; // nothing more to do (received, rejected, cancelled…)
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap justify-end gap-2">{buttons}</div>
            <ErrorAlert message={error} />

            {dialog === "reject" && (
                <ReasonModal
                    title={`Reject ${poNumber}?`}
                    label="Reason for rejecting"
                    required
                    confirmLabel="Reject request"
                    onSubmit={async (reason) => {
                        await api.put(`/purchases/${purchase._id}/reject`, { reason });
                        done(`${poNumber} rejected.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog === "order" && (
                <ConfirmModal
                    title="Mark as ordered?"
                    message={`${poNumber} will be sent to ${purchase.supplier?.name}, who can then see and confirm it in their portal.`}
                    confirmLabel="Mark as ordered"
                    confirmClass="btn-primary"
                    onConfirm={async () => {
                        await api.put(`/purchases/${purchase._id}/order`);
                        done(`${poNumber} sent to the supplier.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog === "cancel" && (
                <ReasonModal
                    title={`${status === "PARTIALLY_RECEIVED" ? "Cancel the rest of" : "Cancel"} ${poNumber}?`}
                    message={status === "PARTIALLY_RECEIVED" ? "Goods already received stay in stock." : undefined}
                    label="Reason (optional)"
                    confirmLabel="Cancel order"
                    onSubmit={async (reason) => {
                        await api.put(`/purchases/${purchase._id}/cancel`, reason ? { reason } : {});
                        done(`${poNumber} cancelled.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog === "receive" && <ReceiveGoodsModal purchase={purchase} onReceived={done} onClose={closeDialog} />}
            {(dialog === "confirm" || dialog === "delivery") && (
                <SupplierDeliveryModal purchase={purchase} mode={dialog} onSaved={done} onClose={closeDialog} />
            )}
        </div>
    );
};

export default PurchaseActions;

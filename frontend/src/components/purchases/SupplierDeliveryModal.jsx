import { useState } from "react";
import Modal from "../common/Modal";
import TextField from "../common/TextField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// The supplier portal's form. Two uses:
//   mode "confirm":  accept the order; date and note are optional
//   mode "delivery": update the delivery details; at least one of them is needed
const SupplierDeliveryModal = ({ purchase, mode, onSaved, onClose }) => {
    const isConfirm = mode === "confirm";

    // <input type="date"> wants "YYYY-MM-DD"
    const [date, setDate] = useState(purchase.expectedDeliveryDate ? purchase.expectedDeliveryDate.slice(0, 10) : "");
    const [note, setNote] = useState(purchase.deliveryNote || "");
    const [error, setError] = useState("");
    const [isWorking, setIsWorking] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");

        // Only send what was filled in (the backend refuses empty text for a date)
        const payload = {};
        if (date) payload.expectedDeliveryDate = date;
        if (note.trim()) payload.deliveryNote = note.trim();

        if (!isConfirm && Object.keys(payload).length === 0) {
            setError("Provide an expected delivery date or a delivery note");
            return;
        }

        setIsWorking(true);
        try {
            await api.put(`/purchases/${purchase._id}/${isConfirm ? "confirm" : "delivery"}`, payload);
            onSaved(isConfirm ? `${purchase.poNumber} confirmed.` : "Delivery details updated.");
        }
        catch (err) {
            setError(getErrorMessage(err, "Could not save"));
            setIsWorking(false);
        }
    };

    return (
        <Modal title={isConfirm ? `Confirm ${purchase.poNumber}` : "Update delivery details"} onClose={onClose}>
            <form onSubmit={handleSubmit} noValidate>
                {isConfirm && <p className="mb-2 text-sm text-base-content/70">Tell the buyer you accept this order. You can add a delivery date and a note.</p>}
                <ErrorAlert message={error} />
                <TextField label="Expected delivery date" type="date" id="expectedDeliveryDate" value={date} onChange={(event) => setDate(event.target.value)} />
                <TextField label="Delivery note" id="deliveryNote" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
                <div className="modal-action">
                    <button type="button" className="btn" onClick={onClose} disabled={isWorking}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isWorking}>
                        {isWorking ? "Saving…" : isConfirm ? "Confirm order" : "Save"}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default SupplierDeliveryModal;

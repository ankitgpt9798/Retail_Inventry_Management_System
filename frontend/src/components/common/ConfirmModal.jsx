import { useState } from "react";
import Modal from "./Modal";
import ErrorAlert from "./ErrorAlert";
import { getErrorMessage } from "../../services/api";

// "Are you sure?" pop-up for risky actions such as deactivating.
//   onConfirm: async function that does the work. If it throws, the server's
//              message (e.g. "warehouse still holds 50 units") is shown here.
const ConfirmModal = ({ title, message, confirmLabel, onConfirm, onClose }) => {
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState("");

    const handleConfirm = async () => {
        setIsWorking(true);
        setError("");
        try {
            await onConfirm();
        }
        catch (err) {
            setError(getErrorMessage(err));
            setIsWorking(false);
        }
    };

    return (
        <Modal title={title} onClose={onClose}>
            <div className="space-y-4">
                <p>{message}</p>
                <ErrorAlert message={error} />
                <div className="modal-action mt-2">
                    <button type="button" className="btn" onClick={onClose} disabled={isWorking}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-error" onClick={handleConfirm} disabled={isWorking}>
                        {isWorking ? "Working…" : confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;

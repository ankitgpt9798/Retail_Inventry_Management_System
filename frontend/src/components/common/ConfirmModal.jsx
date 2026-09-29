import { useState } from "react";
import Modal from "./Modal";
import ErrorAlert from "./ErrorAlert";
import { getErrorMessage } from "../../services/api";

// "Are you sure?" pop-up for risky actions such as deactivating.
//   onConfirm:    async function that does the work. If it throws, the server's message
//                 (e.g. "warehouse still holds 50 units") is shown in the pop-up.
//   confirmClass: button colour — red by default, e.g. "btn-primary" for harmless actions
const ConfirmModal = ({ title, message, confirmLabel, confirmClass = "btn-error", onConfirm, onClose }) => {
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
                    <button type="button" className={`btn ${confirmClass}`} onClick={handleConfirm} disabled={isWorking}>
                        {isWorking ? "Working…" : confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;

import { useState } from "react";
import Modal from "./Modal";
import ErrorAlert from "./ErrorAlert";
import { getErrorMessage } from "../../services/api";

// A pop-up that asks for a short reason before a risky action (reject, cancel…).
//   required: true → the action is blocked until at least 3 characters are typed
//   onSubmit: async (reason) => …  — if it throws, the server's message is shown here
const ReasonModal = ({ title, message, label = "Reason", required = false, confirmLabel, onSubmit, onClose }) => {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isWorking, setIsWorking] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmed = reason.trim();
        if (required && trimmed.length < 3) {
            setError("Please give a reason (at least 3 characters)");
            return;
        }
        setIsWorking(true);
        setError("");
        try {
            await onSubmit(trimmed);
        }
        catch (err) {
            setError(getErrorMessage(err));
            setIsWorking(false);
        }
    };

    return (
        <Modal title={title} onClose={onClose}>
            <form onSubmit={handleSubmit} noValidate className="space-y-2">
                {message && <p>{message}</p>}
                <ErrorAlert message={error} />
                <fieldset className="fieldset">
                    <label className="fieldset-legend" htmlFor="reason">
                        {label}
                    </label>
                    <textarea
                        id="reason"
                        className="textarea w-full"
                        rows={3}
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </fieldset>
                <div className="modal-action">
                    <button type="button" className="btn" onClick={onClose} disabled={isWorking}>
                        Back
                    </button>
                    <button type="submit" className="btn btn-error" disabled={isWorking}>
                        {isWorking ? "Working…" : confirmLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ReasonModal;

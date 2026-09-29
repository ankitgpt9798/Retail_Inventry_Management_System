import { X } from "lucide-react";

// A pop-up window over the page (DaisyUI "modal").
// Only rendered while it is needed, so each opening starts with fresh form state.
const Modal = ({ title, onClose, children, wide = false }) => {
    return (
        <div className="modal modal-open" role="dialog" aria-modal="true" aria-label={title}>
            <div className={`modal-box ${wide ? "max-w-2xl" : ""}`}>
                <button
                    type="button"
                    className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
                    onClick={onClose}
                    aria-label="Close"
                >
                    <X size={16} aria-hidden="true" />
                </button>
                <h3 className="mb-4 pr-8 text-lg font-bold">{title}</h3>
                {children}
            </div>
            <div className="modal-backdrop bg-black/40" onClick={onClose} aria-hidden="true"></div>
        </div>
    );
};

export default Modal;

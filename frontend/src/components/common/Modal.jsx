import { useEffect } from "react";
import { X } from "lucide-react";

// A pop-up window over the page. Only rendered while it is needed,
// so each opening starts with fresh form state.
// Closes with the ✕ button, the Escape key or a click on the dark background.
const Modal = ({ title, description, onClose, children, wide = false }) => {
    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", closeOnEscape);
        // Stop the page behind from scrolling while the pop-up is open
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true"></div>
            <div
                className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-base-100 shadow-raised sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
            >
                <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold">{title}</h3>
                        {description && <p className="mt-0.5 text-sm text-base-content/60">{description}</p>}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm btn-square -mr-2" onClick={onClose} aria-label="Close">
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>
                <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            </div>
        </div>
    );
};

export default Modal;

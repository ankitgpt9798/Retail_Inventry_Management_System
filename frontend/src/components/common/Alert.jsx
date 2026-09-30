import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

const TONES = {
    success: { icon: CircleCheck, className: "border-success/25 bg-success-soft text-success-strong" },
    error: { icon: CircleAlert, className: "border-error/25 bg-error-soft text-error-strong" },
    warning: { icon: TriangleAlert, className: "border-warning/30 bg-warning-soft text-warning-strong" },
    info: { icon: Info, className: "border-info/25 bg-info-soft text-info-strong" }
};

// A coloured message box.
//   <Alert tone="success">Product saved.</Alert>
//   <Alert tone="error" title="Could not load" action={<button …>Try again</button>}>…</Alert>
// Errors use role="alert" (read out immediately); everything else role="status" (or pass `role`).
const Alert = ({ tone = "info", title, children, action, onDismiss, className = "", role }) => {
    const { icon: Icon, className: toneClass } = TONES[tone] || TONES.info;

    return (
        <div role={role || (tone === "error" ? "alert" : "status")} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${toneClass} ${className}`}>
            <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 break-words">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
            {onDismiss && (
                <button type="button" onClick={onDismiss} className="-m-1 shrink-0 rounded-md p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
                    <X size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
};

export default Alert;

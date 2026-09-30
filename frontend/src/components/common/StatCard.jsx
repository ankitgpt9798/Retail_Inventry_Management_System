// One headline number with its label, e.g. "Stock value · ₹1,05,67,900.00".
//
// Long values (big rupee amounts) must never overflow or be cut off, so the card is a
// CSS "container": the number's size depends on how wide the CARD is, not the screen.
// A narrow card (4 in a row) gets a smaller number; a wide one a bigger number.
// If it still doesn't fit, it wraps instead of spilling out.
//
//   <StatCard label="Stock value" value={formatCurrency(12345)} icon={IndianRupee} tone="success" hint="At cost price" />
const TONES = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    error: "bg-error-soft text-error",
    info: "bg-info-soft text-info",
    neutral: "bg-base-200 text-base-content/70"
};

const StatCard = ({ label, value, icon: Icon, tone = "primary", hint, highlight = false, testId }) => {
    return (
        <div
            className={`@container min-w-0 rounded-xl border bg-base-100 p-4 shadow-card sm:p-5 ${
                highlight ? "border-warning/60 ring-1 ring-warning/30" : "border-base-300"
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-medium text-base-content/65">{label}</p>
                {Icon && (
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone] || TONES.primary}`}>
                        <Icon size={18} aria-hidden="true" />
                    </span>
                )}
            </div>
            <p
                className="mt-2 text-xl font-bold leading-tight tracking-tight tabular-nums text-base-content [overflow-wrap:anywhere] @[13rem]:text-2xl @[17rem]:text-[1.75rem]"
                data-testid={testId}
            >
                {value}
            </p>
            {hint && <p className="mt-1 text-xs text-base-content/55">{hint}</p>}
        </div>
    );
};

export default StatCard;

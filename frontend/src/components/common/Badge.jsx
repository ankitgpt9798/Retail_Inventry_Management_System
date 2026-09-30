// A small coloured label, e.g. <Badge tone="success">Paid</Badge>
// The dot repeats the colour so the status can be scanned quickly; the text says what it is.
const TONES = {
    neutral: "bg-base-200 text-base-content/70 ring-base-300",
    primary: "bg-primary-soft text-primary ring-primary/20",
    info: "bg-info-soft text-info-strong ring-info/20",
    success: "bg-success-soft text-success-strong ring-success/20",
    warning: "bg-warning-soft text-warning-strong ring-warning/25",
    error: "bg-error-soft text-error-strong ring-error/20",
    violet: "bg-violet-50 text-violet-700 ring-violet-600/20"
};

const Badge = ({ tone = "neutral", dot = true, children }) => {
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone] || TONES.neutral}`}
        >
            {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>}
            {children}
        </span>
    );
};

export default Badge;

import { Link } from "react-router-dom";

// One record on a listing page, shown as a card instead of a table row.
//
//   <RecordCard
//       label="Basmati Rice 5 kg"                 ← name of the card for screen readers (and tests)
//       title="Basmati Rice 5 kg"  titleTo="/products/1"   ← optional link on the title
//       code="GRO-101"  subtitle="GreenHarvest"   ← small mono code + grey line under the title
//       icon={Package}  status={<StatusBadge … />}
//       accent="warning"                          ← optional coloured stripe on the left (needs attention)
//       footer={<>…buttons…</>}
//   >
//       <CardFields>
//           <CardField label="Price" value="₹649.00" />
//       </CardFields>
//   </RecordCard>
const ACCENTS = {
    warning: "before:bg-warning",
    error: "before:bg-error",
    success: "before:bg-success",
    primary: "before:bg-primary",
    info: "before:bg-info"
};

const RecordCard = ({ label, title, titleTo, code, subtitle, icon: Icon, status, accent, footer, children }) => {
    const accentClass = accent
        ? `relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 ${ACCENTS[accent] || ""}`
        : "";

    return (
        <article
            aria-label={label}
            className={`flex min-w-0 flex-col rounded-xl border border-base-300 bg-base-100 shadow-card transition-shadow hover:shadow-raised ${accentClass}`}
        >
            {/* Header: icon, title (+ code / subtitle) and the status */}
            <header className="flex items-start gap-3 px-5 pt-5">
                {Icon && (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon size={20} aria-hidden="true" />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    {code && <p className="truncate font-mono text-xs font-medium text-base-content/55">{code}</p>}
                    <h3 className="font-semibold leading-snug break-words text-base-content">
                        {titleTo ? (
                            <Link to={titleTo} className="hover:text-primary hover:underline">
                                {title}
                            </Link>
                        ) : (
                            title
                        )}
                    </h3>
                    {subtitle && <p className="mt-0.5 truncate text-sm text-base-content/60">{subtitle}</p>}
                </div>
                {status && <div className="flex shrink-0 flex-col items-end gap-1">{status}</div>}
            </header>

            {/* Body: the important numbers and details */}
            <div className="flex-1 px-5 py-4">{children}</div>

            {/* Footer: the actions (View / Edit / Deactivate …) */}
            {footer && (
                <footer className="flex flex-wrap items-center justify-end gap-1.5 border-t border-base-300 bg-base-200/40 px-4 py-2.5">
                    {footer}
                </footer>
            )}
        </article>
    );
};

// A 2-column grid of label/value pairs inside a card body
export const CardFields = ({ children }) => <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>;

//   <CardField label="Stock" value="120" />   wide = takes the whole row   mono = code-like value
//   strong = bigger, bold number (e.g. the main quantity)
export const CardField = ({ label, value, wide = false, mono = false, strong = false, tone }) => (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
        <dt className="text-xs font-medium text-base-content/55">{label}</dt>
        <dd
            className={`mt-0.5 break-words tabular-nums ${mono ? "font-mono text-[0.8rem]" : "text-sm"} ${
                strong ? "text-base font-semibold" : "font-medium"
            } ${tone === "error" ? "text-error" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning-strong" : "text-base-content"}`}
        >
            {value ?? "—"}
        </dd>
    </div>
);

export default RecordCard;

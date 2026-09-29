// The small box that follows the hovered mark.
//   x, y:  position of the mark as a share of the chart (0–1), so it stays put when the chart resizes
//   title: e.g. "Sep 2026"      rows: [{ label, value, color? }]
const ChartTooltip = ({ x, y, title, rows }) => {
    return (
        <div
            role="tooltip"
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%, calc(-100% - 8px))" }}
        >
            <div className="mb-1 font-semibold">{title}</div>
            {rows.map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                    {row.color && <span className="inline-block h-0.5 w-3 rounded" style={{ background: row.color }} aria-hidden="true"></span>}
                    <span className="text-base-content/70">{row.label}</span>
                    <span className="ml-auto pl-3 font-medium">{row.value}</span>
                </div>
            ))}
        </div>
    );
};

export default ChartTooltip;

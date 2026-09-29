import { useState } from "react";
import { Table2, ChartColumn } from "lucide-react";

// The frame around one chart: title, a one-line description, the chart itself, and a
// "View as table" switch. The table shows the same numbers as text, for screen readers,
// copy-and-paste, and anyone who doesn't want to read a chart.
//   table: { columns: [{ key, label, align?, format? }], rows: [{ … }] }
//   isEmpty: true when there is nothing to draw (all zero / no rows)
const ChartCard = ({ title, description, table, isEmpty = false, children }) => {
    const [showTable, setShowTable] = useState(false);

    return (
        <section className="card border border-base-300 bg-base-100" aria-label={title}>
            <div className="card-body gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold">{title}</h2>
                        {description && <p className="text-sm text-base-content/70">{description}</p>}
                    </div>
                    {!isEmpty && table && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs shrink-0"
                            aria-pressed={showTable}
                            aria-label={`${showTable ? "View chart" : "View table"}: ${title}`}
                            onClick={() => setShowTable((value) => !value)}
                        >
                            {showTable ? <ChartColumn size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />}
                            {showTable ? "Chart" : "Table"}
                        </button>
                    )}
                </div>

                {isEmpty ? (
                    <p className="py-10 text-center text-sm text-base-content/60">Nothing to show for this period yet.</p>
                ) : showTable && table ? (
                    <div className="overflow-x-auto">
                        <table className="table table-sm">
                            <caption className="sr-only">{title}</caption>
                            <thead>
                                <tr>
                                    {table.columns.map((column) => (
                                        <th key={column.key} className={column.align === "right" ? "text-right" : ""}>
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {table.rows.map((row, index) => (
                                    <tr key={index}>
                                        {table.columns.map((column) => (
                                            <td key={column.key} className={column.align === "right" ? "text-right tabular-nums" : ""}>
                                                {column.format ? column.format(row[column.key]) : row[column.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    children
                )}
            </div>
        </section>
    );
};

export default ChartCard;

// A plain read-only table from a column list.
//   columns: [{ key, label, align?: "right", format?: (value, row) => text }]
//   rows:    the data; `key` picks a field from each row
//   getRowKey: how to identify a row (defaults to its position)
const DataTable = ({ columns, rows, emptyText = "No data.", getRowKey = (row, index) => index }) => {
    if (rows.length === 0) {
        return <p className="p-8 text-center text-base-content/70">{emptyText}</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="table">
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column.key} className={column.align === "right" ? "text-right" : ""}>
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={getRowKey(row, index)}>
                            {columns.map((column) => (
                                <td key={column.key} className={column.align === "right" ? "text-right tabular-nums" : ""}>
                                    {column.format ? column.format(row[column.key], row) : row[column.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default DataTable;

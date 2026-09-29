import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import StatTile from "../../components/common/StatTile";
import DataTable from "../../components/common/DataTable";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import ReportFilters from "../../components/reports/ReportFilters";
import { REPORTS } from "../../components/reports/reportConfigs";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";

const emptyFilters = { from: "", to: "", warehouse: "", category: "", supplier: "", sortBy: "units", limit: "10" };

// The report the page opens with, and the values it sends to the API by default
const DEFAULT_REPORT = REPORTS[0];

// One page, eight reports. Pick a tab, narrow it with filters, read the numbers, charts and table.
const ReportsPage = () => {
    const [reportKey, setReportKey] = useState(DEFAULT_REPORT.key);
    const [filters, setFilters] = useState(emptyFilters);
    const report = REPORTS.find((item) => item.key === reportKey);

    // What the API sent, together with WHICH report it belongs to. Right after a tab change the
    // old report's data is still here for a moment, and the new report must never try to draw it.
    const [loaded, setLoaded] = useState(null); // { key, data }
    const [error, setError] = useState("");
    const data = loaded?.key === report.key ? loaded.data : null;

    // Choices for the filter drop-downs (loaded once; admins and managers may read all three lists)
    const warehouses = useOptions("/warehouses", "warehouses");
    const categories = useOptions("/categories", "categories");
    const suppliers = useOptions("/suppliers", "suppliers");

    // Only the filters this report has are sent, and empty ones are left out
    const paramsKey = JSON.stringify(
        Object.fromEntries(
            report.filters.flatMap((name) => {
                if (name === "range") return [["from", filters.from], ["to", filters.to]];
                return [[name, filters[name]]];
            }).filter(([, value]) => value !== "")
        )
    );

    const load = useCallback(async () => {
        setError("");
        try {
            const response = await api.get(report.path, { params: JSON.parse(paramsKey) });
            setLoaded({ key: report.key, data: response.data.data });
        }
        catch (err) {
            setLoaded(null);
            setError(getErrorMessage(err, "Could not load the report"));
        }
    }, [report.key, report.path, paramsKey]);

    useEffect(() => {
        load();
    }, [load]);

    const chooseReport = (key) => {
        setReportKey(key);
        setFilters(emptyFilters); // every report starts fresh
        setError("");
    };

    const changeFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));

    const tiles = data && report.tiles ? report.tiles(data) : [];
    const charts = data && report.charts ? report.charts(data) : [];
    const table = data ? report.table(data) : null;

    return (
        <>
            <PageHeader title="Reports" description="Stock, sales and purchasing figures for your business." />

            <div className="mb-6 overflow-x-auto">
                <div role="tablist" aria-label="Reports" className="tabs tabs-box inline-flex w-max">
                    {REPORTS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={item.key === reportKey}
                            className={`tab ${item.key === reportKey ? "tab-active" : ""}`}
                            onClick={() => chooseReport(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card border border-base-300 bg-base-100">
                <div className="border-b border-base-300 p-4">
                    <h2 className="font-semibold">{report.label}</h2>
                    <p className="text-sm text-base-content/70">{report.description}</p>
                </div>

                <ReportFilters filters={report.filters} values={filters} onChange={changeFilter} options={{ warehouses, categories, suppliers }} />

                <div className="space-y-6 p-4" role="tabpanel" aria-label={report.label}>
                    {error ? (
                        <ErrorAlert message={error} onRetry={load} />
                    ) : !data ? (
                        <Loader text="Loading report…" />
                    ) : (
                        <>
                            {tiles.length > 0 && (
                                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                                    {tiles.map((tile) => (
                                        <StatTile key={tile.label} label={tile.label} value={tile.value} />
                                    ))}
                                </div>
                            )}
                            {charts.length > 0 && <div className="grid gap-6 lg:grid-cols-2">{charts}</div>}
                            <div className="overflow-hidden rounded-box border border-base-300">
                                {table.title && <h3 className="border-b border-base-300 px-4 py-3 font-semibold">{table.title}</h3>}
                                <DataTable columns={table.columns} rows={table.rows} getRowKey={table.getRowKey} emptyText={table.empty || "No data for these filters."} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default ReportsPage;

import { FilterSelect } from "../common/ListToolbar";

// The filter controls above a report. Which ones show is decided by the report's `filters` list.
//   values:   { from, to, warehouse, category, supplier, sortBy, limit }  (all text)
//   onChange: (name, value) => …
//   options:  { warehouses, categories, suppliers } for the drop-downs
const ReportFilters = ({ filters, values, onChange, options }) => {
    if (filters.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-base-300 p-4 sm:px-6">
            {filters.includes("range") && (
                <>
                    <label className="flex items-center gap-2 text-sm">
                        From
                        <input type="date" className="input w-auto" value={values.from} max={values.to || undefined} onChange={(event) => onChange("from", event.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        To
                        <input type="date" className="input w-auto" value={values.to} min={values.from || undefined} onChange={(event) => onChange("to", event.target.value)} />
                    </label>
                </>
            )}
            {filters.includes("warehouse") && (
                <FilterSelect label="Warehouse" value={values.warehouse} onChange={(value) => onChange("warehouse", value)}>
                    <option value="">All warehouses</option>
                    {options.warehouses.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
            )}
            {filters.includes("category") && (
                <FilterSelect label="Category" value={values.category} onChange={(value) => onChange("category", value)}>
                    <option value="">All categories</option>
                    {options.categories.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
            )}
            {filters.includes("supplier") && (
                <FilterSelect label="Supplier" value={values.supplier} onChange={(value) => onChange("supplier", value)}>
                    <option value="">All suppliers</option>
                    {options.suppliers.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
                </FilterSelect>
            )}
            {filters.includes("sortBy") && (
                <FilterSelect label="Rank by" value={values.sortBy} onChange={(value) => onChange("sortBy", value)}>
                    <option value="units">Units sold</option>
                    <option value="revenue">Revenue</option>
                </FilterSelect>
            )}
            {filters.includes("limit") && (
                <FilterSelect label="Show" value={values.limit} onChange={(value) => onChange("limit", value)}>
                    {["5", "10", "20", "50"].map((count) => (
                        <option key={count} value={count}>
                            Top {count}
                        </option>
                    ))}
                </FilterSelect>
            )}
            {filters.includes("range") && !values.from && !values.to && (
                <span className="text-xs text-base-content/60">No dates chosen: showing the last 6 months.</span>
            )}
        </div>
    );
};

export default ReportFilters;

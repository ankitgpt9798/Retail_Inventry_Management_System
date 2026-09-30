import { Search, X } from "lucide-react";

// The white bar above every card list: a search box plus filter drop-downs (passed as children).
// Phones: everything stacks. Tablets: filters wrap in a grid. Desktop: one row.
//   onClear + hasFilters → shows a "Clear" button while any filter is on
const ListToolbar = ({ search, onSearchChange, placeholder = "Search…", hasFilters = false, onClear, children }) => {
    return (
        <div className="mb-5 rounded-xl border border-base-300 bg-base-100 p-3 shadow-card sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                {onSearchChange && (
                    <div className="relative w-full lg:max-w-xs xl:max-w-sm">
                        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/45" />
                        <input
                            type="search"
                            className="input pl-9"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder={placeholder}
                            aria-label="Search"
                        />
                    </div>
                )}
                <div className="grid flex-1 grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:flex md:flex-wrap md:items-center">{children}</div>
                {onClear && hasFilters && (
                    <button type="button" className="btn btn-ghost btn-sm self-start text-base-content/70 lg:self-center" onClick={onClear}>
                        <X size={14} aria-hidden="true" /> Clear
                    </button>
                )}
            </div>
        </div>
    );
};

// A small drop-down for filters:
//   <FilterSelect label="Status" value={status} onChange={setStatus}><option …/></FilterSelect>
export const FilterSelect = ({ label, value, onChange, children }) => (
    <select className="select md:w-auto md:min-w-[9rem]" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
    </select>
);

// A labelled date box for "from" / "to" filters:  <DateFilter label="From" value={from} onChange={…} max={to} />
export const DateFilter = ({ label, value, onChange, min, max }) => (
    <label className="flex min-w-0 items-center gap-2 text-sm text-base-content/70">
        <span className="shrink-0">{label}</span>
        <input
            type="date"
            className="input md:w-auto"
            value={value}
            min={min || undefined}
            max={max || undefined}
            onChange={(event) => onChange(event.target.value)}
        />
    </label>
);

// A tick-box filter such as "Low stock only"
export const FilterCheckbox = ({ label, checked, onChange }) => (
    <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-base-300 px-3 text-sm shadow-card">
        <input type="checkbox" className="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {label}
    </label>
);

export default ListToolbar;

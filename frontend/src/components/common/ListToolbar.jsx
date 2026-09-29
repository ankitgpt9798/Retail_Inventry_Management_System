import { Search } from "lucide-react";

// The row above every table: a search box plus any filter drop-downs (passed as children)
const ListToolbar = ({ search, onSearchChange, placeholder = "Search…", children }) => {
    return (
        <div className="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center">
            <label className="input w-full sm:max-w-xs">
                <Search size={16} aria-hidden="true" className="opacity-60" />
                <input
                    type="search"
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={placeholder}
                    aria-label="Search"
                />
            </label>
            <div className="flex flex-wrap gap-3">{children}</div>
        </div>
    );
};

// A small drop-down for filters:
//   <FilterSelect label="Status" value={status} onChange={setStatus}><option …/></FilterSelect>
export const FilterSelect = ({ label, value, onChange, children }) => (
    <select
        className="select w-auto"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
    >
        {children}
    </select>
);

export default ListToolbar;

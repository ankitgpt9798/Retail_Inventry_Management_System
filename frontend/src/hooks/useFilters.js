import { useState } from "react";
import { useSearchParams } from "react-router-dom";

// The filter state of a listing page, in one object, plus the page number.
// Changing any filter goes back to page 1 (page 3 of the old results may not exist any more).
//
//   const INITIAL = { search: "", status: "", sort: "newest" };   ← defined OUTSIDE the component
//   const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL);
//   <FilterSelect value={filters.status} onChange={(value) => setFilter("status", value)} />
//
// The page STARTS with any matching values from the address, so other pages can link to a
// filtered list, e.g. /inventory?search=GRO-101 or /products?category=665f…
// "Clear filters" always goes back to INITIAL.
const useFilters = (initialFilters) => {
    const [searchParams] = useSearchParams();
    const [filters, setFilters] = useState(() => {
        const fromAddress = Object.keys(initialFilters)
            .filter((name) => searchParams.has(name))
            .map((name) => [name, searchParams.get(name)]);
        return { ...initialFilters, ...Object.fromEntries(fromAddress) };
    });
    const [page, setPage] = useState(1);

    const setFilter = (name, value) => {
        setFilters((current) => ({ ...current, [name]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setFilters(initialFilters);
        setPage(1);
    };

    // true when anything differs from the starting values (used for "Clear filters")
    const hasFilters = Object.keys(initialFilters).some((name) => filters[name] !== initialFilters[name]);

    return { filters, setFilter, clearFilters, hasFilters, page, setPage };
};

export default useFilters;

import { ChevronLeft, ChevronRight } from "lucide-react";

// "Page 2 of 5 · 43 items" with Previous / Next buttons.
// `pagination` is exactly what the backend sends: { page, limit, total, totalPages }
const Pagination = ({ pagination, onPageChange }) => {
    if (!pagination || pagination.total === 0) return null;

    const { page, totalPages, total } = pagination;

    return (
        <div className="flex items-center justify-between gap-4 border-t border-base-300 px-4 py-3 text-sm">
            <span className="text-base-content/70">
                Page {page} of {totalPages} · {total} {total === 1 ? "item" : "items"}
            </span>
            <div className="join">
                <button
                    type="button"
                    className="btn btn-sm join-item"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    aria-label="Previous page"
                >
                    <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="btn btn-sm join-item"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                    aria-label="Next page"
                >
                    <ChevronRight size={16} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};

export default Pagination;

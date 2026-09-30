import { ChevronLeft, ChevronRight } from "lucide-react";

// Which page numbers to show: always the first and last, and the pages around the current one.
// 1 … 4 5 [6] 7 8 … 20   ("…" = pages left out)
export const getPageNumbers = (page, totalPages) => {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const around = [page - 1, page, page + 1].filter((number) => number > 1 && number < totalPages);
    const numbers = [1];
    if (around[0] > 2) numbers.push("…");
    numbers.push(...around);
    if (around.at(-1) < totalPages - 1) numbers.push("…");
    numbers.push(totalPages);
    return numbers;
};

// "Showing 1–10 of 50" with Previous · 1 2 3 · Next.
// `pagination` is exactly what the backend sends: { page, limit, total, totalPages }
// On phones only Previous / "3 / 5" / Next are shown so the row never overflows.
const Pagination = ({ pagination, onPageChange, noun = "results" }) => {
    if (!pagination || pagination.total === 0) return null;

    const { page, limit, total, totalPages } = pagination;
    const first = (page - 1) * limit + 1;
    const last = Math.min(page * limit, total);

    return (
        <nav className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between" aria-label="Pagination">
            <p className="text-sm text-base-content/60">
                Showing <span className="font-medium text-base-content">{first}–{last}</span> of{" "}
                <span className="font-medium text-base-content">{total}</span> {noun}
            </p>

            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        className="btn btn-sm"
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={16} aria-hidden="true" />
                        <span className="hidden sm:inline">Previous</span>
                    </button>

                    {/* Page numbers (tablet and up) */}
                    <div className="hidden items-center gap-1 sm:flex">
                        {getPageNumbers(page, totalPages).map((number, index) =>
                            number === "…" ? (
                                <span key={`gap-${index}`} className="px-1.5 text-sm text-base-content/50" aria-hidden="true">
                                    …
                                </span>
                            ) : (
                                <button
                                    key={number}
                                    type="button"
                                    onClick={() => onPageChange(number)}
                                    aria-label={`Page ${number}`}
                                    aria-current={number === page ? "page" : undefined}
                                    className={`btn btn-sm min-w-[2.125rem] px-2 ${number === page ? "btn-primary" : "btn-ghost"}`}
                                >
                                    {number}
                                </button>
                            )
                        )}
                    </div>
                    {/* Phones: just "2 / 5" */}
                    <span className="px-2 text-sm font-medium tabular-nums sm:hidden">
                        {page} / {totalPages}
                    </span>

                    <button
                        type="button"
                        className="btn btn-sm"
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(page + 1)}
                        aria-label="Next page"
                    >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight size={16} aria-hidden="true" />
                    </button>
                </div>
            )}
        </nav>
    );
};

export default Pagination;

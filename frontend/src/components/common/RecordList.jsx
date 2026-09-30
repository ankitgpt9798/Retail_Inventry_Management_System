import { SearchX, TriangleAlert, X } from "lucide-react";
import CardSkeleton from "./CardSkeleton";
import EmptyState from "./EmptyState";

// The body of every listing page. It shows exactly ONE of:
//   loading → skeleton cards · error → error panel with "Try again"
//   nothing found → empty state (with "Clear filters" when filters are on) · otherwise → the cards
//
//   <RecordList
//       items={items} isLoading={isLoading} error={error} onRetry={reload}
//       noun="products"                      ← used in "No products found"
//       isFiltered={hasFilters} onClearFilters={clearFilters}
//       emptyMessage="Add your first product to get started." emptyAction={<button…/>}
//       renderItem={(product) => <RecordCard key={product._id} … />}
//   />
// Cards sit in a grid: 1 per row on phones, 2 on tablets, 3 on wide screens.
const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

const RecordList = ({
    items,
    isLoading,
    error,
    onRetry,
    renderItem,
    noun = "records",
    isFiltered = false,
    onClearFilters,
    emptyIcon,
    emptyTitle,
    emptyMessage,
    emptyAction,
    grid = GRID,
    skeletons = 6
}) => {
    if (error) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title={`Could not load ${noun}`}
                message={error}
                action={
                    onRetry && (
                        <button type="button" className="btn" onClick={onRetry}>
                            Try again
                        </button>
                    )
                }
            />
        );
    }

    if (isLoading) {
        return (
            <div className={grid} role="status" aria-label={`Loading ${noun}…`}>
                {Array.from({ length: skeletons }, (_, index) => (
                    <CardSkeleton key={index} />
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        // Filters on → the list is empty because of them, so offer to clear them
        return isFiltered ? (
            <EmptyState
                icon={SearchX}
                title={`No ${noun} found`}
                message="Try changing your search or filters."
                action={
                    onClearFilters && (
                        <button type="button" className="btn" onClick={onClearFilters}>
                            <X size={16} aria-hidden="true" /> Clear filters
                        </button>
                    )
                }
            />
        ) : (
            <EmptyState icon={emptyIcon} title={emptyTitle || `No ${noun} yet`} message={emptyMessage} action={emptyAction} />
        );
    }

    return <div className={grid}>{items.map(renderItem)}</div>;
};

export default RecordList;

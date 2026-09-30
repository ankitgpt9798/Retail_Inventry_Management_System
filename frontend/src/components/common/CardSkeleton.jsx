// A grey placeholder shaped like a RecordCard, shown while a list is loading
// (it keeps the page from jumping when the real cards arrive).
const CardSkeleton = () => {
    return (
        <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-card" aria-hidden="true">
            <div className="flex items-start gap-3">
                <div className="skeleton size-10 shrink-0"></div>
                <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-1/3"></div>
                    <div className="skeleton h-4 w-3/4"></div>
                </div>
                <div className="skeleton h-5 w-16 rounded-full"></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((key) => (
                    <div key={key} className="space-y-1.5">
                        <div className="skeleton h-2.5 w-1/2"></div>
                        <div className="skeleton h-3.5 w-2/3"></div>
                    </div>
                ))}
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-base-300 pt-3">
                <div className="skeleton h-7 w-16"></div>
                <div className="skeleton h-7 w-16"></div>
            </div>
        </div>
    );
};

export default CardSkeleton;

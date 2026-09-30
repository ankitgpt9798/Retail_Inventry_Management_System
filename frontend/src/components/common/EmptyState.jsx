import { Inbox } from "lucide-react";

// What a list shows when there is nothing in it.
//   <EmptyState title="No products found" message="Try changing your search or filters." action={<button…/>} />
const EmptyState = ({ icon: Icon = Inbox, title, message, action }) => {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-100 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-base-200 text-base-content/50">
                <Icon size={24} aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold text-base-content">{title}</h3>
            {message && <p className="mt-1 max-w-sm text-sm text-base-content/60">{message}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
};

export default EmptyState;

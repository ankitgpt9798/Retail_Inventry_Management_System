// The title area at the top of every staff-app page:
// title + one-line description on the left, action buttons on the right (below on phones)
const PageHeader = ({ title, description, children }) => {
    return (
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-base-content sm:text-[1.75rem]">{title}</h1>
                {description && <p className="mt-1 text-sm text-base-content/60 sm:text-base">{description}</p>}
            </div>
            {children && <div className="flex flex-wrap gap-2">{children}</div>}
        </div>
    );
};

export default PageHeader;

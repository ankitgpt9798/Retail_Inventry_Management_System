// The title area at the top of every staff-app page:
// title + one-line description on the left, action buttons on the right
const PageHeader = ({ title, description, children }) => {
    return (
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                {description && <p className="mt-1 text-base-content/70">{description}</p>}
            </div>
            {children && <div className="flex flex-wrap gap-2">{children}</div>}
        </div>
    );
};

export default PageHeader;

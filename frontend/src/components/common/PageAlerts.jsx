import Alert from "./Alert";
import ErrorAlert from "./ErrorAlert";

// The success message and/or action error shown at the top of a page after the user did something,
// e.g. "Product deactivated." — every listing page has these two, so they live in one place.
const PageAlerts = ({ notice, error, onDismissNotice }) => {
    if (!notice && !error) return null;

    return (
        <div className="mb-5 space-y-3">
            {notice && (
                <Alert tone="success" onDismiss={onDismissNotice}>
                    {notice}
                </Alert>
            )}
            <ErrorAlert message={error} />
        </div>
    );
};

export default PageAlerts;

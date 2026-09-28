import { CircleAlert } from "lucide-react";

// Shows an error message; if onRetry is given, also a "Try again" button
const ErrorAlert = ({ message, onRetry }) => {
    if (!message) return null;

    return (
        <div role="alert" className="alert alert-error alert-soft">
            <CircleAlert size={20} aria-hidden="true" />
            <span>{message}</span>
            {onRetry && (
                <button type="button" className="btn btn-sm" onClick={onRetry}>
                    Try again
                </button>
            )}
        </div>
    );
};

export default ErrorAlert;

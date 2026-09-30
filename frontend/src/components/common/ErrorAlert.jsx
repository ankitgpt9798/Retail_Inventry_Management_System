import { RotateCw } from "lucide-react";
import Alert from "./Alert";

// Shows an error message; if onRetry is given, also a "Try again" button
const ErrorAlert = ({ message, onRetry, className }) => {
    if (!message) return null;

    return (
        <Alert
            tone="error"
            className={className}
            action={
                onRetry && (
                    <button type="button" className="btn btn-sm" onClick={onRetry}>
                        <RotateCw size={14} aria-hidden="true" /> Try again
                    </button>
                )
            }
        >
            {message}
        </Alert>
    );
};

export default ErrorAlert;

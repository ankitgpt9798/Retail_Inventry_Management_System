import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

// Any URL that doesn't match a route
const NotFoundPage = () => {
    return (
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
            <Compass size={48} className="mx-auto text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-3xl font-bold">Page not found</h1>
            <p className="mt-2 text-base-content/70">The page you're looking for doesn't exist or has moved.</p>
            <Link to="/" className="btn btn-primary mt-6">Go to the home page</Link>
        </div>
    );
};

export default NotFoundPage;

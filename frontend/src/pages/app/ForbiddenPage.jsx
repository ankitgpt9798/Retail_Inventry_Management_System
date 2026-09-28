import { ShieldX } from "lucide-react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { getHomePath } from "../../utils/navigation";
import { formatRole } from "../../utils/roles";

// Shown when a logged-in user opens a page their role can't use
const ForbiddenPage = () => {
    const user = useSelector((state) => state.auth.user);

    return (
        <div className="mx-auto max-w-lg py-16 text-center">
            <ShieldX size={48} className="mx-auto text-error" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold">You don't have access to this page</h1>
            <p className="mt-2 text-base-content/70">
                Your role ({formatRole(user?.role)}) can't open this page. If you need it, ask an administrator.
            </p>
            <Link to={getHomePath(user?.role)} className="btn btn-primary mt-6">
                Back to my home page
            </Link>
        </div>
    );
};

export default ForbiddenPage;

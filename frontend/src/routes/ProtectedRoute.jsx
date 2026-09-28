import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import Loader from "../components/common/Loader";
import ForbiddenPage from "../pages/app/ForbiddenPage";

// Wraps pages that need a logged-in user.
//   <ProtectedRoute>                 → any logged-in user
//   <ProtectedRoute roles={[...]}>   → only these roles
//
// This only decides what the BROWSER shows. The real security is the backend:
// even if someone bypassed this, the API would still answer 401/403.
const ProtectedRoute = ({ roles, children }) => {
    const { user, isCheckingSession } = useSelector((state) => state.auth);
    const location = useLocation();

    // 1. Still asking the backend "who am I?" (e.g. just after a page refresh)
    if (isCheckingSession) {
        return <Loader text="Checking your session…" fullPage />;
    }

    // 2. Not logged in → login page, remembering where they wanted to go
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    // 3. Logged in but this role may not open the page
    if (roles && !roles.includes(user.role)) {
        return <ForbiddenPage />;
    }

    return children;
};

export default ProtectedRoute;

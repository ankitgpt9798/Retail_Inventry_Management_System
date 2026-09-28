import { Outlet } from "react-router-dom";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

// The frame around every public page. <Outlet /> is where React Router
// puts the current page (Home, Features, Login, …).
const PublicLayout = () => {
    return (
        <div className="flex min-h-screen flex-col bg-base-100">
            <PublicHeader />
            <main className="flex-1">
                <Outlet />
            </main>
            <PublicFooter />
        </div>
    );
};

export default PublicLayout;

import { Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import AppNavbar from "./AppNavbar";
import AppSidebar from "./AppSidebar";
import Loader from "../common/Loader";

// The frame around every staff-app page: a sidebar on the left (desktop), a top bar,
// the page itself on a light grey background, and a small footer.
const AppLayout = () => {
    const { pathname } = useLocation();

    return (
        <div className="min-h-screen bg-base-200">
            <AppSidebar pathname={pathname} />
            <div className="flex min-h-screen min-w-0 flex-col lg:pl-64">
                <AppNavbar />
                <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                    {/* Pages are downloaded on first visit (see AppRoutes); show a spinner while one arrives */}
                    <Suspense fallback={<Loader text="Loading page…" />}>
                        <Outlet />
                    </Suspense>
                </main>
                <footer className="border-t border-base-300 bg-base-100">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-base-content/55 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
                        <span>© {new Date().getFullYear()} StockFlow</span>
                        <span className="flex gap-4">
                            <Link to="/" className="hover:text-base-content">Public website</Link>
                            <Link to="/contact" className="hover:text-base-content">Help &amp; contact</Link>
                        </span>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default AppLayout;

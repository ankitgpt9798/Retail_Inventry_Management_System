import { Link, Outlet } from "react-router-dom";
import AppNavbar from "./AppNavbar";

// The frame around every staff-app page: top navigation, a centred page area
// (like a website, not a full-width admin panel) and a small footer.
const AppLayout = () => {
    return (
        <div className="flex min-h-screen flex-col bg-base-200">
            <AppNavbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
                <Outlet />
            </main>
            <footer className="border-t border-base-300 bg-base-100">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-base-content/60 sm:flex-row sm:justify-between">
                    <span>© {new Date().getFullYear()} RetailFlow</span>
                    <span className="flex gap-4">
                        <Link to="/" className="hover:text-base-content">Public website</Link>
                        <Link to="/contact" className="hover:text-base-content">Help &amp; contact</Link>
                    </span>
                </div>
            </footer>
        </div>
    );
};

export default AppLayout;

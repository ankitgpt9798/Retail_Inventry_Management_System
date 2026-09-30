import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

// The frame around every public page. <Outlet /> is where React Router
// puts the current page (Home, Contact, Login, …).
const PublicLayout = () => {
    const { pathname, hash } = useLocation();

    // Links such as "/#features" scroll to that section of the page; other page changes start at the top
    useEffect(() => {
        if (hash) {
            document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: "smooth" });
        }
        else {
            window.scrollTo?.(0, 0);
        }
    }, [pathname, hash]);

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

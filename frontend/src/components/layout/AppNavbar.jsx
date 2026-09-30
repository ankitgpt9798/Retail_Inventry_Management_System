import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import Logo from "../common/Logo";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import { SidebarNav } from "./AppSidebar";
import { getHomePath } from "../../utils/navigation";

// The bar across the top of the staff app: menu button (phones/tablets), logo, bell and account menu.
// On phones and tablets the menu button opens a drawer with the same links as the desktop sidebar.
const AppNavbar = () => {
    const user = useSelector((state) => state.auth.user);
    const { pathname } = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Close the drawer after moving to another page, and with the Escape key
    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);
    useEffect(() => {
        if (!drawerOpen) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === "Escape") setDrawerOpen(false);
        };
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [drawerOpen]);

    // Just after logout the user is null for a moment, before the page changes
    if (!user) {
        return null;
    }

    return (
        <>
            <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100/90 backdrop-blur">
                <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
                    <button type="button" className="btn btn-ghost btn-square lg:hidden" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
                        <Menu size={20} aria-hidden="true" />
                    </button>
                    <div className="lg:hidden">
                        <Logo to={getHomePath(user.role)} />
                    </div>

                    <div className="ml-auto flex items-center gap-1 sm:gap-2">
                        <NotificationBell />
                        <UserMenu />
                    </div>
                </div>
            </header>

            {/* Phone / tablet drawer */}
            {drawerOpen && (
                <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
                    <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawerOpen(false)} aria-hidden="true"></div>
                    <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-base-100 shadow-raised">
                        <div className="flex h-16 shrink-0 items-center justify-between border-b border-base-300 px-4">
                            <Logo to={getHomePath(user.role)} />
                            <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-3 py-5">
                            <SidebarNav label="App menu" pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AppNavbar;

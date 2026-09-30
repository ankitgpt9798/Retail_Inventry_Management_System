import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useSelector } from "react-redux";
import { Link, NavLink, useLocation } from "react-router-dom";
import Logo from "../common/Logo";
import { getHomePath } from "../../utils/navigation";

// "Features" and "How it works" are sections of the home page (/#features), not separate pages
const PUBLIC_LINKS = [
    { to: "/", label: "Home" },
    { to: "/#features", label: "Features" },
    { to: "/#workflow", label: "How it works" },
    { to: "/contact", label: "Contact" }
];

const linkClass = "rounded-lg px-3 py-2 text-sm font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content";

const PublicHeader = () => {
    const user = useSelector((state) => state.auth.user);
    const { pathname, hash } = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    // Close the phone menu after choosing a link
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname, hash]);

    // The page you're on is highlighted (hash links only light up when that section was chosen)
    const isActive = (to) => (to.includes("#") ? `${pathname}${hash}` === to : pathname === to && !hash);

    return (
        <header className="sticky top-0 z-30 border-b border-base-300/80 bg-base-100/85 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <Logo />

                {/* Desktop links */}
                <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                    {PUBLIC_LINKS.map((link) => (
                        <NavLink key={link.to} to={link.to} className={`${linkClass} ${isActive(link.to) ? "text-primary" : ""}`} aria-current={isActive(link.to) ? "page" : undefined}>
                            {link.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    {/* Already logged in → go straight to the app */}
                    {user ? (
                        <Link to={getHomePath(user.role)} className="btn btn-primary btn-sm">
                            Go to Dashboard
                        </Link>
                    ) : (
                        <>
                            <Link to="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                                Log in
                            </Link>
                            <Link to="/register" className="btn btn-primary btn-sm">
                                Get Started
                            </Link>
                        </>
                    )}

                    <button
                        type="button"
                        className="btn btn-ghost btn-square btn-sm md:hidden"
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
                    </button>
                </div>
            </div>

            {/* Phone menu */}
            {menuOpen && (
                <nav className="border-t border-base-300 bg-base-100 px-4 py-3 md:hidden" aria-label="Main (phone)">
                    <ul className="space-y-1">
                        {PUBLIC_LINKS.map((link) => (
                            <li key={link.to}>
                                <Link to={link.to} className={`block ${linkClass}`}>
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                        {!user && (
                            <li>
                                <Link to="/login" className={`block ${linkClass}`}>
                                    Log in
                                </Link>
                            </li>
                        )}
                    </ul>
                </nav>
            )}
        </header>
    );
};

export default PublicHeader;

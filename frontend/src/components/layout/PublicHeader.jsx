import { Menu } from "lucide-react";
import { useSelector } from "react-redux";
import { Link, NavLink } from "react-router-dom";
import Logo from "../common/Logo";
import { getHomePath } from "../../utils/navigation";

const PUBLIC_LINKS = [
    { to: "/", label: "Home" },
    { to: "/features", label: "Features" },
    { to: "/about", label: "About" },
    { to: "/contact", label: "Contact" }
];

// NavLink adds "active" styling to the link of the page you're on
const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "text-primary" : "text-base-content/80 hover:text-base-content"}`;

const PublicHeader = () => {
    const user = useSelector((state) => state.auth.user);

    return (
        <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/90 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
                <Logo />

                {/* Desktop links */}
                <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                    {PUBLIC_LINKS.map((link) => (
                        <NavLink key={link.to} to={link.to} end className={linkClass}>
                            {link.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    {/* Already logged in → go straight to the app */}
                    {user ? (
                        <Link to={getHomePath(user.role)} className="btn btn-primary btn-sm">
                            Open app
                        </Link>
                    ) : (
                        <>
                            <Link to="/register" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                                Request access
                            </Link>
                            <Link to="/login" className="btn btn-primary btn-sm">
                                Log in
                            </Link>
                        </>
                    )}

                    {/* Phone menu */}
                    <div className="dropdown dropdown-end md:hidden">
                        <div tabIndex={0} role="button" className="btn btn-ghost btn-square btn-sm" aria-label="Open menu">
                            <Menu size={20} />
                        </div>
                        <ul tabIndex={0} className="dropdown-content menu z-40 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                            {PUBLIC_LINKS.map((link) => (
                                <li key={link.to}>
                                    <NavLink to={link.to} end>{link.label}</NavLink>
                                </li>
                            ))}
                            {!user && (
                                <li>
                                    <NavLink to="/register">Request access</NavLink>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default PublicHeader;

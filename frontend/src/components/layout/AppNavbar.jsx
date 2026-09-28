import { Menu } from "lucide-react";
import { useSelector } from "react-redux";
import { NavLink } from "react-router-dom";
import Logo from "../common/Logo";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import { getHomePath, getLinksForRole } from "../../utils/navigation";

const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-primary/10 text-primary" : "text-base-content/75 hover:bg-base-200 hover:text-base-content"
    }`;

// The staff app's top navigation. Links depend on the user's role
// (see utils/navigation.js), so e.g. a supplier never sees "Inventory".
const AppNavbar = () => {
    const user = useSelector((state) => state.auth.user);

    // Just after logout the user is null for a moment, before the page changes
    if (!user) {
        return null;
    }

    const links = getLinksForRole(user.role);

    return (
        <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
                {/* Phone menu */}
                {links.length > 0 && (
                    <div className="dropdown lg:hidden">
                        <div tabIndex={0} role="button" className="btn btn-ghost btn-square btn-sm" aria-label="Open menu">
                            <Menu size={20} />
                        </div>
                        <ul tabIndex={0} className="dropdown-content menu z-40 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                            {links.map((link) => (
                                <li key={link.to}>
                                    <NavLink to={link.to}>
                                        <link.icon size={16} aria-hidden="true" /> {link.label}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <Logo to={getHomePath(user.role)} />

                {/* Desktop links */}
                <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="App">
                    {links.map((link) => (
                        <NavLink key={link.to} to={link.to} className={linkClass}>
                            <link.icon size={16} aria-hidden="true" />
                            {link.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="ml-auto flex items-center gap-1">
                    <NotificationBell />
                    <UserMenu />
                </div>
            </div>
        </header>
    );
};

export default AppNavbar;

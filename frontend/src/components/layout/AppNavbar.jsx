import { ChevronDown, Menu } from "lucide-react";
import { useSelector } from "react-redux";
import { NavLink, useLocation } from "react-router-dom";
import Logo from "../common/Logo";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import { getHomePath, getLinksForRole, getNavItems } from "../../utils/navigation";

const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-primary/10 text-primary" : "text-base-content/75 hover:bg-base-200 hover:text-base-content"
    }`;

// Several related links under one button, e.g. "Stock ▾" → Inventory, Warehouses, Transfers.
// It opens while it has focus and closes when you click elsewhere (DaisyUI "dropdown").
const NavGroup = ({ label, links }) => {
    const { pathname } = useLocation();
    const isActive = links.some((link) => pathname === link.to || pathname.startsWith(`${link.to}/`));

    return (
        // A new key after every page change builds the menu again, closed
        <div key={pathname} className="dropdown">
            <div
                tabIndex={0}
                role="button"
                className={`flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-primary/10 text-primary" : "text-base-content/75 hover:bg-base-200 hover:text-base-content"
                }`}
            >
                {label}
                <ChevronDown size={14} aria-hidden="true" />
            </div>
            <ul tabIndex={0} className="dropdown-content menu z-40 mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                {links.map((link) => (
                    <li key={link.to}>
                        <NavLink to={link.to}>
                            <link.icon size={16} aria-hidden="true" /> {link.label}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// The menu button for phones: every link in one list. Like NavGroup it opens while it has focus, and a new key
// after every page change builds it again CLOSED, so it doesn't stay open on top of the page you just chose.
const PhoneMenu = ({ links }) => {
    const { pathname } = useLocation();

    return (
        <div key={pathname} className="dropdown lg:hidden">
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
    );
};

// The staff app's top navigation. Links depend on the user's role
// (see utils/navigation.js), so e.g. a supplier never sees "Inventory".
const AppNavbar = () => {
    const user = useSelector((state) => state.auth.user);

    // Just after logout the user is null for a moment, before the page changes
    if (!user) {
        return null;
    }

    const links = getLinksForRole(user.role);
    const navItems = getNavItems(user.role);

    return (
        <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
                {/* Phone menu */}
                {links.length > 0 && <PhoneMenu links={links} />}

                <Logo to={getHomePath(user.role)} />

                {/* Desktop links */}
                <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="App">
                    {navItems.map((item) =>
                        item.type === "group" ? (
                            <NavGroup key={item.label} label={item.label} links={item.links} />
                        ) : (
                            <NavLink key={item.link.to} to={item.link.to} className={linkClass}>
                                <item.link.icon size={16} aria-hidden="true" />
                                {item.link.label}
                            </NavLink>
                        )
                    )}
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

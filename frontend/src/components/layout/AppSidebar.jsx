import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Logo from "../common/Logo";
import { getHomePath, getNavSections } from "../../utils/navigation";

// "Inventory" must not light up on /inventory/history (that has its own link), so links are matched exactly;
// detail pages (/orders/123) still light up their list's link.
const isLinkActive = (to, pathname) => {
    if (pathname === to) return true;
    if (to === "/inventory") return false;
    return pathname.startsWith(`${to}/`);
};

// The list of links, grouped under headings (Catalog, Stock, Sales…).
// Used in the desktop sidebar AND in the phone drawer, so both always show the same pages.
export const SidebarNav = ({ label = "App", pathname, onNavigate }) => {
    const user = useSelector((state) => state.auth.user);
    if (!user) return null;

    return (
        <nav aria-label={label} className="space-y-6">
            {getNavSections(user.role).map((section) => (
                <div key={section.label || "main"}>
                    {section.label && (
                        <p className="mb-2 px-3 text-[0.7rem] font-semibold tracking-wider text-base-content/45 uppercase">{section.label}</p>
                    )}
                    <ul className="space-y-0.5">
                        {section.links.map((link) => {
                            const active = isLinkActive(link.to, pathname);
                            return (
                                <li key={link.to}>
                                    <Link
                                        to={link.to}
                                        onClick={onNavigate}
                                        aria-current={active ? "page" : undefined}
                                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                            active
                                                ? "bg-primary-soft text-primary"
                                                : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                                        }`}
                                    >
                                        <link.icon size={18} aria-hidden="true" className={active ? "text-primary" : "text-base-content/50"} />
                                        {link.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );
};

// The fixed left column on laptops and desktops (hidden on phones and tablets — they use the drawer)
const AppSidebar = ({ pathname }) => {
    const user = useSelector((state) => state.auth.user);
    if (!user) return null;

    return (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-base-300 bg-base-100 lg:flex">
            <div className="flex h-16 shrink-0 items-center border-b border-base-300 px-5">
                <Logo to={getHomePath(user.role)} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">
                <SidebarNav pathname={pathname} />
            </div>
        </aside>
    );
};

export default AppSidebar;

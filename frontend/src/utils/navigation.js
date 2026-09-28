import { LayoutDashboard } from "lucide-react";
import { ROLES } from "./roles";

const { ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER } = ROLES;

// Which roles may open each page. Used by BOTH the navigation (which links to show)
// and the routes (who may open the URL), so the two can never disagree.
// These mirror the backend's permissions — the backend still enforces them.
export const PAGE_ACCESS = {
    dashboard: [ADMIN, INVENTORY_MANAGER, STAFF],
    profile: [ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER]
};

// Links in the staff app's top navigation (more are added as each part is built)
export const APP_LINKS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: PAGE_ACCESS.dashboard }
];

export const getLinksForRole = (role) => {
    return APP_LINKS.filter((link) => link.roles.includes(role));
};

// Where a user lands after logging in
export const getHomePath = (role) => {
    if (PAGE_ACCESS.dashboard.includes(role)) {
        return "/dashboard";
    }
    // Suppliers get their purchase-order portal in Part 17.5; until then, their profile
    return "/profile";
};

import { Boxes, LayoutDashboard, Tags, Warehouse } from "lucide-react";
import { ROLES } from "./roles";

const { ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER } = ROLES;

// Which roles may open each page. Used by BOTH the navigation (which links to show)
// and the routes (who may open the URL), so the two can never disagree.
// These mirror the backend's permissions — the backend still enforces them.
export const PAGE_ACCESS = {
    dashboard: [ADMIN, INVENTORY_MANAGER, STAFF],
    products: [ADMIN, INVENTORY_MANAGER, STAFF],
    categories: [ADMIN, INVENTORY_MANAGER, STAFF],
    warehouses: [ADMIN, INVENTORY_MANAGER, STAFF],
    profile: [ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER]
};

// Who may CHANGE things (create / edit / deactivate). Everyone in PAGE_ACCESS can view.
// Same rules as the backend: admin edits the catalog, admin + manager edit warehouses.
export const EDIT_ACCESS = {
    products: [ADMIN],
    categories: [ADMIN],
    warehouses: [ADMIN, INVENTORY_MANAGER]
};

export const canEdit = (page, role) => EDIT_ACCESS[page]?.includes(role) ?? false;

// Links in the staff app's top navigation (more are added as each part is built)
export const APP_LINKS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: PAGE_ACCESS.dashboard },
    { to: "/products", label: "Products", icon: Boxes, roles: PAGE_ACCESS.products },
    { to: "/categories", label: "Categories", icon: Tags, roles: PAGE_ACCESS.categories },
    { to: "/warehouses", label: "Warehouses", icon: Warehouse, roles: PAGE_ACCESS.warehouses }
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

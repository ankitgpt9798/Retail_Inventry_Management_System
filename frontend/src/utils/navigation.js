import { ArrowLeftRight, Boxes, ClipboardList, FileText, LayoutDashboard, PackageCheck, ShoppingCart, Tags, Truck, Warehouse } from "lucide-react";
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
    inventory: [ADMIN, INVENTORY_MANAGER, STAFF],
    // Transfers are a manager job (staff get 403 from the backend)
    transfers: [ADMIN, INVENTORY_MANAGER],
    // Managers can look at orders (they hold stock); staff and admin create and process them
    orders: [ADMIN, INVENTORY_MANAGER, STAFF],
    orderForm: [ADMIN, STAFF],
    fulfillment: [ADMIN, INVENTORY_MANAGER, STAFF],
    suppliers: [ADMIN, INVENTORY_MANAGER],
    // Suppliers see (only) their own purchase orders; managers run the whole workflow
    purchases: [ADMIN, INVENTORY_MANAGER, SUPPLIER],
    purchaseForm: [ADMIN, INVENTORY_MANAGER],
    profile: [ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER]
};

// Who may CHANGE things (create / edit / deactivate). Everyone in PAGE_ACCESS can view.
// Same rules as the backend: admin edits the catalog, admin + manager edit warehouses.
export const EDIT_ACCESS = {
    products: [ADMIN],
    categories: [ADMIN],
    warehouses: [ADMIN, INVENTORY_MANAGER],
    inventory: [ADMIN, INVENTORY_MANAGER],
    transfers: [ADMIN, INVENTORY_MANAGER],
    orders: [ADMIN, STAFF],
    fulfillment: [ADMIN, STAFF],
    suppliers: [ADMIN, INVENTORY_MANAGER],
    purchases: [ADMIN, INVENTORY_MANAGER]
};

export const canEdit = (page, role) => EDIT_ACCESS[page]?.includes(role) ?? false;

// Links in the staff app's top navigation (more are added as each part is built)
export const APP_LINKS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: PAGE_ACCESS.dashboard },
    { to: "/products", label: "Products", icon: Boxes, roles: PAGE_ACCESS.products },
    { to: "/categories", label: "Categories", icon: Tags, roles: PAGE_ACCESS.categories },
    { to: "/warehouses", label: "Warehouses", icon: Warehouse, roles: PAGE_ACCESS.warehouses },
    { to: "/inventory", label: "Inventory", icon: ClipboardList, roles: PAGE_ACCESS.inventory },
    { to: "/transfers", label: "Transfers", icon: ArrowLeftRight, roles: PAGE_ACCESS.transfers },
    { to: "/orders", label: "Orders", icon: ShoppingCart, roles: PAGE_ACCESS.orders },
    { to: "/fulfillment", label: "Fulfillment", icon: PackageCheck, roles: PAGE_ACCESS.fulfillment },
    { to: "/suppliers", label: "Suppliers", icon: Truck, roles: PAGE_ACCESS.suppliers },
    { to: "/purchases", label: "Purchases", icon: FileText, roles: PAGE_ACCESS.purchases }
];

export const getLinksForRole = (role) => {
    return APP_LINKS.filter((link) => link.roles.includes(role));
};

// Where a user lands after logging in
export const getHomePath = (role) => {
    if (PAGE_ACCESS.dashboard.includes(role)) {
        return "/dashboard";
    }
    // Suppliers land on their purchase orders (the supplier portal)
    if (PAGE_ACCESS.purchases.includes(role)) {
        return "/purchases";
    }
    return "/profile";
};

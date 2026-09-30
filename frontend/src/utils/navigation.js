import { ArrowLeftRight, Boxes, ChartColumn, ClipboardList, Contact, FileText, History, LayoutDashboard, PackageCheck, ScrollText, ShoppingCart, Tags, Truck, Users, Warehouse } from "lucide-react";
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
    // Customers are built from orders, so whoever sees orders sees them (read-only)
    customers: [ADMIN, INVENTORY_MANAGER, STAFF],
    fulfillment: [ADMIN, INVENTORY_MANAGER, STAFF],
    suppliers: [ADMIN, INVENTORY_MANAGER],
    // Suppliers see (only) their own purchase orders; managers run the whole workflow
    purchases: [ADMIN, INVENTORY_MANAGER, SUPPLIER],
    purchaseForm: [ADMIN, INVENTORY_MANAGER],
    reports: [ADMIN, INVENTORY_MANAGER],
    users: [ADMIN],
    auditLogs: [ADMIN],
    // Everyone has a personal notification inbox
    notifications: [ADMIN, INVENTORY_MANAGER, STAFF, SUPPLIER],
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
    purchases: [ADMIN, INVENTORY_MANAGER],
    users: [ADMIN]
};

export const canEdit = (page, role) => EDIT_ACCESS[page]?.includes(role) ?? false;

// Links in the staff app's sidebar, in order. Links with the same `group` are shown under one heading.
export const APP_LINKS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: PAGE_ACCESS.dashboard },
    { to: "/products", label: "Products", icon: Boxes, roles: PAGE_ACCESS.products, group: "Catalog" },
    { to: "/categories", label: "Categories", icon: Tags, roles: PAGE_ACCESS.categories, group: "Catalog" },
    { to: "/inventory", label: "Inventory", icon: ClipboardList, roles: PAGE_ACCESS.inventory, group: "Stock" },
    { to: "/inventory/history", label: "Stock history", icon: History, roles: PAGE_ACCESS.inventory, group: "Stock" },
    { to: "/warehouses", label: "Warehouses", icon: Warehouse, roles: PAGE_ACCESS.warehouses, group: "Stock" },
    { to: "/transfers", label: "Transfers", icon: ArrowLeftRight, roles: PAGE_ACCESS.transfers, group: "Stock" },
    { to: "/orders", label: "Orders", icon: ShoppingCart, roles: PAGE_ACCESS.orders, group: "Sales" },
    { to: "/fulfillment", label: "Fulfillment", icon: PackageCheck, roles: PAGE_ACCESS.fulfillment, group: "Sales" },
    { to: "/customers", label: "Customers", icon: Contact, roles: PAGE_ACCESS.customers, group: "Sales" },
    { to: "/suppliers", label: "Suppliers", icon: Truck, roles: PAGE_ACCESS.suppliers, group: "Purchasing" },
    { to: "/purchases", label: "Purchases", icon: FileText, roles: PAGE_ACCESS.purchases, group: "Purchasing" },
    { to: "/reports", label: "Reports", icon: ChartColumn, roles: PAGE_ACCESS.reports, group: "Insights" },
    { to: "/users", label: "Users", icon: Users, roles: PAGE_ACCESS.users, group: "Admin" },
    { to: "/audit-logs", label: "Audit log", icon: ScrollText, roles: PAGE_ACCESS.auditLogs, group: "Admin" }
];

export const getLinksForRole = (role) => {
    return APP_LINKS.filter((link) => link.roles.includes(role));
};

// The sidebar: the role's links split into sections, each with its heading (or none, for Dashboard).
// A section only appears when the role can open at least one of its pages.
// Returns [{ label: "Stock" | null, links: [...] }]
export const getNavSections = (role) => {
    const sections = [];
    for (const link of getLinksForRole(role)) {
        const label = link.group || null;
        const section = sections.find((item) => item.label === label);
        if (section) {
            section.links.push(link);
        }
        else {
            sections.push({ label, links: [link] });
        }
    }
    return sections;
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

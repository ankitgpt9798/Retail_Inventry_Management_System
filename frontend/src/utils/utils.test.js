import { canEdit, getHomePath, getLinksForRole, getNavItems } from "./navigation";
import { formatRole } from "./roles";
import { formatCurrency, formatNumber, greeting } from "./format";

describe("navigation", () => {
    test("staff roles see the catalog links; suppliers see none", () => {
        expect(getLinksForRole("STAFF").map((link) => link.label)).toEqual(["Dashboard", "Products", "Categories", "Inventory", "Warehouses", "Orders", "Fulfillment"]);
        expect(getLinksForRole("INVENTORY_MANAGER").map((link) => link.label)).toEqual(expect.arrayContaining(["Suppliers", "Purchases"]));
        // Transfers are a manager job, so staff never see that link
        expect(getLinksForRole("INVENTORY_MANAGER").map((link) => link.label)).toContain("Transfers");
        // A supplier user sees only the portal: their purchase orders
        expect(getLinksForRole("SUPPLIER").map((link) => link.label)).toEqual(["Purchases"]);
    });

    test("the top bar groups links into drop-downs, and admin-only pages stay admin-only", () => {
        const admin = getNavItems("ADMIN");
        expect(admin.map((item) => (item.type === "group" ? `${item.label}:${item.links.length}` : item.link.label))).toEqual([
            "Dashboard", "Catalog:2", "Stock:3", "Sales:2", "Purchasing:2", "Reports", "Admin:2"
        ]);

        const labels = (role) => getLinksForRole(role).map((link) => link.label);
        expect(labels("ADMIN")).toEqual(expect.arrayContaining(["Reports", "Users", "Audit log"]));
        expect(labels("INVENTORY_MANAGER")).toContain("Reports");
        expect(labels("INVENTORY_MANAGER")).not.toContain("Users");
        expect(labels("INVENTORY_MANAGER")).not.toContain("Audit log");
        expect(labels("STAFF")).not.toContain("Reports");
    });

    test("a group with a single visible link becomes a plain link (a supplier's Purchases)", () => {
        expect(getNavItems("SUPPLIER")).toEqual([expect.objectContaining({ type: "link", link: expect.objectContaining({ label: "Purchases" }) })]);
        // staff have no purchasing pages at all
        expect(getNavItems("STAFF").some((item) => item.type === "group" && item.label === "Purchasing")).toBe(false);
    });

    test("edit rights match the backend: admin edits the catalog, admin + manager edit warehouses", () => {
        expect(canEdit("products", "ADMIN")).toBe(true);
        expect(canEdit("products", "INVENTORY_MANAGER")).toBe(false);
        expect(canEdit("categories", "STAFF")).toBe(false);
        expect(canEdit("warehouses", "INVENTORY_MANAGER")).toBe(true);
        expect(canEdit("warehouses", "STAFF")).toBe(false);
        expect(canEdit("inventory", "INVENTORY_MANAGER")).toBe(true);
        expect(canEdit("inventory", "STAFF")).toBe(false);
        // Orders: admin + staff manage them, the manager only views
        expect(canEdit("orders", "STAFF")).toBe(true);
        expect(canEdit("orders", "INVENTORY_MANAGER")).toBe(false);
        expect(canEdit("fulfillment", "INVENTORY_MANAGER")).toBe(false);
        expect(canEdit("suppliers", "INVENTORY_MANAGER")).toBe(true);
        expect(canEdit("suppliers", "STAFF")).toBe(false);
        expect(canEdit("purchases", "SUPPLIER")).toBe(false);
        expect(canEdit("nothing", "ADMIN")).toBe(false);
    });

    test("home page after login depends on the role", () => {
        expect(getHomePath("ADMIN")).toBe("/dashboard");
        expect(getHomePath("INVENTORY_MANAGER")).toBe("/dashboard");
        expect(getHomePath("SUPPLIER")).toBe("/purchases");
    });
});

describe("formatting", () => {
    test("roles read like words", () => {
        expect(formatRole("INVENTORY_MANAGER")).toBe("Inventory Manager");
        expect(formatRole("ADMIN")).toBe("Admin");
    });

    test("numbers and money use the Indian format", () => {
        expect(formatNumber(1234567)).toBe("12,34,567");
        expect(formatCurrency(120472.1)).toBe("₹1,20,472.10");
    });

    test("greeting follows the time of day", () => {
        expect(greeting(new Date(2026, 8, 28, 9))).toBe("Good morning");
        expect(greeting(new Date(2026, 8, 28, 14))).toBe("Good afternoon");
        expect(greeting(new Date(2026, 8, 28, 20))).toBe("Good evening");
    });
});

import { canEdit, getHomePath, getLinksForRole } from "./navigation";
import { formatRole } from "./roles";
import { formatCurrency, formatNumber, greeting } from "./format";

describe("navigation", () => {
    test("staff roles see the catalog links; suppliers see none", () => {
        expect(getLinksForRole("STAFF").map((link) => link.label)).toEqual(["Dashboard", "Products", "Categories", "Warehouses"]);
        expect(getLinksForRole("SUPPLIER")).toEqual([]);
    });

    test("edit rights match the backend: admin edits the catalog, admin + manager edit warehouses", () => {
        expect(canEdit("products", "ADMIN")).toBe(true);
        expect(canEdit("products", "INVENTORY_MANAGER")).toBe(false);
        expect(canEdit("categories", "STAFF")).toBe(false);
        expect(canEdit("warehouses", "INVENTORY_MANAGER")).toBe(true);
        expect(canEdit("warehouses", "STAFF")).toBe(false);
        expect(canEdit("nothing", "ADMIN")).toBe(false);
    });

    test("home page after login depends on the role", () => {
        expect(getHomePath("ADMIN")).toBe("/dashboard");
        expect(getHomePath("INVENTORY_MANAGER")).toBe("/dashboard");
        expect(getHomePath("SUPPLIER")).toBe("/profile");
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

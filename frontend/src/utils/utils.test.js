import { getHomePath, getLinksForRole } from "./navigation";
import { formatRole } from "./roles";
import { formatCurrency, formatNumber, greeting } from "./format";

describe("navigation", () => {
    test("staff roles see the Dashboard link; suppliers don't", () => {
        expect(getLinksForRole("STAFF").map((link) => link.label)).toEqual(["Dashboard"]);
        expect(getLinksForRole("SUPPLIER")).toEqual([]);
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

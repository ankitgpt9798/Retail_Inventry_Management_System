// Business Rules 1 and 7 as pure functions — no database needed
const { getAvailable, isLowStock, becameLowStock } = require("../../src/services/inventoryService");

describe("Rule 1: availableQuantity = quantity - reservedQuantity", () => {
    test("100 on shelf, 30 reserved → 70 available", () => {
        expect(getAvailable({ quantity: 100, reservedQuantity: 30 })).toBe(70);
    });
});

describe("Rule 7: low stock when available < reorderLevel", () => {
    test("available below the level is low", () => {
        expect(isLowStock({ quantity: 25, reservedQuantity: 10, reorderLevel: 20 })).toBe(true);
    });

    test("available exactly AT the level is not low (the rule says 'less than')", () => {
        expect(isLowStock({ quantity: 20, reservedQuantity: 0, reorderLevel: 20 })).toBe(false);
    });

    test("reserved units count against availability", () => {
        expect(isLowStock({ quantity: 100, reservedQuantity: 90, reorderLevel: 20 })).toBe(true);
    });
});

describe("becameLowStock: alert only when crossing below the level", () => {
    const level = { reservedQuantity: 0, reorderLevel: 20 };

    test("25 → 15 crosses the level → alert", () => {
        expect(becameLowStock({ ...level, quantity: 25 }, { ...level, quantity: 15 })).toBe(true);
    });

    test("15 → 10 was already low → no second alert", () => {
        expect(becameLowStock({ ...level, quantity: 15 }, { ...level, quantity: 10 })).toBe(false);
    });

    test("50 → 30 stays above → no alert", () => {
        expect(becameLowStock({ ...level, quantity: 50 }, { ...level, quantity: 30 })).toBe(false);
    });

    test("raising the reorder level can cross too", () => {
        expect(becameLowStock(
            { quantity: 30, reservedQuantity: 0, reorderLevel: 20 },
            { quantity: 30, reservedQuantity: 0, reorderLevel: 40 }
        )).toBe(true);
    });
});

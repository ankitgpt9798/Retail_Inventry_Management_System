const { calculateTotal, calculateReceiptStatus } = require("../../src/services/purchaseService");

describe("calculateTotal", () => {
    test("sums quantity × unit cost over all lines", () => {
        const items = [
            { quantityOrdered: 10, unitCost: 42000 },
            { quantityOrdered: 50, unitCost: 600 }
        ];
        expect(calculateTotal(items)).toBe(450000);
    });

    test("rounds to 2 decimals (no floating-point leftovers)", () => {
        expect(calculateTotal([{ quantityOrdered: 3, unitCost: 0.1 }])).toBe(0.3);
    });
});

describe("calculateReceiptStatus", () => {
    test("nothing received yet → ORDERED", () => {
        expect(calculateReceiptStatus([{ quantityOrdered: 10, quantityReceived: 0 }])).toBe("ORDERED");
    });

    test("some received → PARTIALLY_RECEIVED", () => {
        expect(calculateReceiptStatus([
            { quantityOrdered: 10, quantityReceived: 10 },
            { quantityOrdered: 5, quantityReceived: 0 }
        ])).toBe("PARTIALLY_RECEIVED");
    });

    test("every line fully received → RECEIVED", () => {
        expect(calculateReceiptStatus([
            { quantityOrdered: 10, quantityReceived: 10 },
            { quantityOrdered: 5, quantityReceived: 5 }
        ])).toBe("RECEIVED");
    });
});

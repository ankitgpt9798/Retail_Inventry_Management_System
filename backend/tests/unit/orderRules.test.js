const { calculateLine, calculateOrderTotals } = require("../../src/services/orderService");

describe("calculateLine", () => {
    test("2 laptops at 49,999 with 18% tax", () => {
        expect(calculateLine({ unitPrice: 49999, taxRate: 18, quantity: 2 })).toEqual({
            lineSubtotal: 99998,
            lineTax: 17999.64,
            lineTotal: 117997.64
        });
    });

    test("0% tax", () => {
        expect(calculateLine({ unitPrice: 650, taxRate: 0, quantity: 3 })).toEqual({
            lineSubtotal: 1950, lineTax: 0, lineTotal: 1950
        });
    });

    test("tax is rounded to 2 decimals", () => {
        // 3 × 699 = 2097; 18% = 377.46
        expect(calculateLine({ unitPrice: 699, taxRate: 18, quantity: 3 }).lineTax).toBe(377.46);
        // 1 × 0.99 at 5% = 0.0495 → 0.05
        expect(calculateLine({ unitPrice: 0.99, taxRate: 5, quantity: 1 }).lineTax).toBe(0.05);
    });
});

describe("calculateOrderTotals", () => {
    test("sums the lines", () => {
        const lines = [
            calculateLine({ unitPrice: 49999, taxRate: 18, quantity: 2 }),
            calculateLine({ unitPrice: 699, taxRate: 18, quantity: 3 })
        ];

        expect(calculateOrderTotals(lines)).toEqual({
            subtotal: 102095,
            taxAmount: 18377.1,
            totalAmount: 120472.1
        });
    });
});

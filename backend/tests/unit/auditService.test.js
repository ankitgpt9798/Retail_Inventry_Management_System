const mongoose = require("mongoose");
const { getChanges } = require("../../src/services/auditService");

describe("getChanges", () => {
    test("keeps only fields whose value changed", () => {
        const before = { name: "Laptop", price: 100, status: "ACTIVE" };
        const after = { name: "Laptop", price: 120, status: "ACTIVE" };

        expect(getChanges(before, after)).toEqual({
            oldValue: { price: 100 },
            newValue: { price: 120 }
        });
    });

    test("no changes → two empty objects", () => {
        expect(getChanges({ a: 1 }, { a: 1 })).toEqual({ oldValue: {}, newValue: {} });
    });

    test("two ObjectIds with the same value count as unchanged", () => {
        const id = new mongoose.Types.ObjectId();

        expect(getChanges({ category: id }, { category: new mongoose.Types.ObjectId(id.toString()) }))
            .toEqual({ oldValue: {}, newValue: {} });
    });

    test("a removed value is recorded", () => {
        expect(getChanges({ barcode: "123" }, { barcode: undefined })).toEqual({
            oldValue: { barcode: "123" },
            newValue: { barcode: undefined }
        });
    });
});

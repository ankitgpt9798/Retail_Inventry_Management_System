const escapeRegex = require("../../src/utils/escapeRegex");

describe("escapeRegex", () => {
    test("normal text is unchanged", () => {
        expect(escapeRegex("Ravi Kumar")).toBe("Ravi Kumar");
    });

    test("special characters become plain characters", () => {
        const pattern = new RegExp(escapeRegex("a.b(c)*"));

        expect(pattern.test("a.b(c)*")).toBe(true);
        expect(pattern.test("axb(c)")).toBe(false);
    });

    test("an unbalanced bracket no longer crashes RegExp", () => {
        expect(() => new RegExp(escapeRegex("price (old"))).not.toThrow();
    });
});

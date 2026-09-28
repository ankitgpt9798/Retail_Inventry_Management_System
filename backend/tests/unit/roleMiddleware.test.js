// authorize() is a plain function, so we can test it with a fake req object.
// No server or database needed.
const { authorize } = require("../../src/middleware/roleMiddleware");
const { ROLES } = require("../../src/utils/constants");

describe("authorize middleware", () => {
    test("calls next() when the user's role is allowed", () => {
        const req = { user: { role: ROLES.INVENTORY_MANAGER } };
        const next = jest.fn();

        authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER)(req, {}, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    test("throws 403 FORBIDDEN when the role is not allowed", () => {
        const req = { user: { role: ROLES.STAFF } };
        const next = jest.fn();

        expect(() => authorize(ROLES.ADMIN)(req, {}, next)).toThrow(
            expect.objectContaining({ statusCode: 403, errorCode: "FORBIDDEN" })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test("SUPPLIER cannot access a manager-only route", () => {
        const req = { user: { role: ROLES.SUPPLIER } };

        expect(() => authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER)(req, {}, jest.fn()))
            .toThrow(expect.objectContaining({ statusCode: 403 }));
    });

    test("throws 401 if protect did not run first (no req.user)", () => {
        expect(() => authorize(ROLES.ADMIN)({}, {}, jest.fn()))
            .toThrow(expect.objectContaining({ statusCode: 401, errorCode: "NOT_AUTHENTICATED" }));
    });
});

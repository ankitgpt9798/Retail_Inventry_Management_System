const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Supplier = require("../../src/models/Supplier");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS, USER_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let adminAgent;
let managerAgent;
let staffAgent;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Supplier.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
});

afterAll(async () => {
    await closeTestDB();
});

const acmeBody = () => ({
    name: "Acme Electronics Pvt Ltd",
    contactPerson: "Suresh Mehta",
    email: "Sales@Acme.in",
    phone: "+91 98765 43210",
    address: "Nehru Place",
    city: "Delhi"
});

describe("Access control", () => {
    test("ADMIN and MANAGER can manage suppliers", async () => {
        expect((await adminAgent.post("/api/suppliers").send(acmeBody())).status).toBe(201);
        expect((await managerAgent.get("/api/suppliers")).status).toBe(200);
    });

    test("STAFF and SUPPLIER users cannot see suppliers", async () => {
        const supplier = await Supplier.create({ name: "Acme", email: "a@acme.in" });
        await createTestUser({ role: ROLES.SUPPLIER, email: "portal@acme.in", supplier: supplier._id });
        const supplierAgent = await loginAgent("portal@acme.in");

        expect((await staffAgent.get("/api/suppliers")).status).toBe(403);
        expect((await supplierAgent.get("/api/suppliers")).status).toBe(403);
        expect((await request(app).get("/api/suppliers")).status).toBe(401);
    });
});

describe("POST /api/suppliers", () => {
    test("creates an ACTIVE supplier, email saved in lowercase, audited", async () => {
        const response = await managerAgent.post("/api/suppliers").send(acmeBody());

        expect(response.status).toBe(201);
        expect(response.body.data.supplier).toMatchObject({
            name: "Acme Electronics Pvt Ltd",
            email: "sales@acme.in",
            status: RECORD_STATUS.ACTIVE
        });
        expect(await AuditLog.countDocuments({ action: "SUPPLIER_CREATED" })).toBe(1);
    });

    test("duplicate email (any case) → 409", async () => {
        await managerAgent.post("/api/suppliers").send(acmeBody());
        const response = await managerAgent.post("/api/suppliers").send({ ...acmeBody(), name: "Other", email: "SALES@acme.in" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("SUPPLIER_EMAIL_EXISTS");
    });

    test("the same NAME with a different email is allowed", async () => {
        await managerAgent.post("/api/suppliers").send({ ...acmeBody(), name: "Sharma Traders", email: "delhi@sharma.in" });
        const response = await managerAgent.post("/api/suppliers").send({ ...acmeBody(), name: "Sharma Traders", email: "pune@sharma.in" });

        expect(response.status).toBe(201);
    });

    test.each([
        ["missing name", { name: undefined }, "Supplier name is required"],
        ["bad email", { email: "acme" }, "Email is not valid"],
        ["letters in phone", { phone: "call me" }, "Phone must be 7-20 characters: digits, spaces, +, - or brackets"],
        ["short phone", { phone: "12345" }, "Phone must be 7-20 characters: digits, spaces, +, - or brackets"]
    ])("%s → 422", async (label, override, expectedMessage) => {
        const response = await managerAgent.post("/api/suppliers").send({ ...acmeBody(), ...override });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });
});

describe("GET /api/suppliers", () => {
    beforeEach(async () => {
        await Supplier.create([
            { name: "Acme Electronics", contactPerson: "Suresh", email: "sales@acme.in", city: "Delhi" },
            { name: "Bharat Foods", contactPerson: "Anita", email: "orders@bharatfoods.in", city: "Mumbai" },
            { name: "Old Parts Co", email: "info@oldparts.in", city: "Delhi", status: RECORD_STATUS.INACTIVE }
        ]);
    });

    const names = (response) => response.body.data.suppliers.map((s) => s.name);

    test("sorted by name with pagination", async () => {
        const response = await managerAgent.get("/api/suppliers?limit=2");

        expect(names(response)).toEqual(["Acme Electronics", "Bharat Foods"]);
        expect(response.body.data.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    });

    test("search by name, contact person or email", async () => {
        expect(names(await managerAgent.get("/api/suppliers?search=bharat"))).toEqual(["Bharat Foods"]);
        expect(names(await managerAgent.get("/api/suppliers?search=suresh"))).toEqual(["Acme Electronics"]);
        expect(names(await managerAgent.get("/api/suppliers?search=oldparts.in"))).toEqual(["Old Parts Co"]);
    });

    test("filter by city and status", async () => {
        expect(names(await managerAgent.get("/api/suppliers?city=delhi&status=ACTIVE"))).toEqual(["Acme Electronics"]);
    });
});

describe("GET /api/suppliers/:id", () => {
    test("includes the supplier's login users (without passwords)", async () => {
        const supplier = await Supplier.create({ name: "Acme", email: "sales@acme.in" });
        await createTestUser({ role: ROLES.SUPPLIER, email: "suresh@acme.in", name: "Suresh", supplier: supplier._id });

        const response = await managerAgent.get(`/api/suppliers/${supplier._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.users).toHaveLength(1);
        expect(response.body.data.users[0]).toMatchObject({ name: "Suresh", email: "suresh@acme.in", status: "ACTIVE" });
        expect(response.body.data.users[0].password).toBeUndefined();
    });

    test("unknown id → 404", async () => {
        const response = await managerAgent.get("/api/suppliers/000000000000000000000000");

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("SUPPLIER_NOT_FOUND");
    });
});

describe("Update and deactivate", () => {
    let supplier;
    let supplierUser;

    beforeEach(async () => {
        supplier = await Supplier.create({ name: "Acme", email: "sales@acme.in" });
        supplierUser = await createTestUser({ role: ROLES.SUPPLIER, email: "suresh@acme.in", supplier: supplier._id });
    });

    test("edit is audited with only the changed fields", async () => {
        await managerAgent.put(`/api/suppliers/${supplier._id}`).send({ phone: "011-2345-6789" });
        const auditLog = await AuditLog.findOne({ action: "SUPPLIER_UPDATED" });

        expect(auditLog.newValue).toEqual({ phone: "011-2345-6789" });
    });

    test("cannot take another supplier's email", async () => {
        await Supplier.create({ name: "Other", email: "other@x.in" });
        const response = await managerAgent.put(`/api/suppliers/${supplier._id}`).send({ email: "OTHER@x.in" });

        expect(response.status).toBe(409);
    });

    test("DELETE deactivates the supplier AND its active login users", async () => {
        const supplierAgent = await loginAgent("suresh@acme.in");

        const response = await managerAgent.delete(`/api/suppliers/${supplier._id}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Supplier deactivated. 1 supplier login(s) were also deactivated.");
        expect(response.body.data.deactivatedUserCount).toBe(1);
        expect((await User.findById(supplierUser._id)).status).toBe(USER_STATUS.INACTIVE);
        expect((await supplierAgent.get("/api/auth/me")).status).toBe(403);
        expect(await AuditLog.countDocuments({ action: "USER_DEACTIVATED", entityId: supplierUser._id })).toBe(1);
    });

    test("PUT status INACTIVE does the same", async () => {
        const response = await managerAgent.put(`/api/suppliers/${supplier._id}`).send({ status: RECORD_STATUS.INACTIVE });

        expect(response.body.data.deactivatedUserCount).toBe(1);
        expect((await User.findById(supplierUser._id)).status).toBe(USER_STATUS.INACTIVE);
    });

    test("other suppliers' users and non-supplier users are not touched", async () => {
        const otherSupplier = await Supplier.create({ name: "Other", email: "other@x.in" });
        const otherUser = await createTestUser({ role: ROLES.SUPPLIER, email: "o@x.in", supplier: otherSupplier._id });

        await managerAgent.delete(`/api/suppliers/${supplier._id}`);

        expect((await User.findById(otherUser._id)).status).toBe(USER_STATUS.ACTIVE);
    });

    test("reactivating the supplier does NOT reactivate its users automatically", async () => {
        await managerAgent.delete(`/api/suppliers/${supplier._id}`);
        const response = await managerAgent.put(`/api/suppliers/${supplier._id}`).send({ status: RECORD_STATUS.ACTIVE });

        expect(response.body.data.supplier.status).toBe(RECORD_STATUS.ACTIVE);
        expect(response.body.message).toBe("Supplier updated successfully.");
        expect((await User.findById(supplierUser._id)).status).toBe(USER_STATUS.INACTIVE);
    });

    test("deactivating twice is harmless", async () => {
        await managerAgent.delete(`/api/suppliers/${supplier._id}`);
        const second = await managerAgent.delete(`/api/suppliers/${supplier._id}`);

        expect(second.status).toBe(200);
        expect(second.body.data.deactivatedUserCount).toBe(0);
        expect(await AuditLog.countDocuments({ action: "SUPPLIER_DEACTIVATED" })).toBe(1);
    });
});

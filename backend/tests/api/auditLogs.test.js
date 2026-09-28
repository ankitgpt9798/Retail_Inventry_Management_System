const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent, TEST_PASSWORD } = require("../helpers/userHelpers");

let admin;
let adminAgent;
let managerAgent;
let staffAgent;
let supplierAgent;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Category.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    admin = await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com", name: "Admin" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com", name: "Ravi" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");
});

afterAll(async () => {
    await closeTestDB();
});

// Real actions through the API, which write real audit records
const createAndEditLaptop = async () => {
    const category = await adminAgent.post("/api/categories").send({ name: "Electronics" });
    const product = await adminAgent.post("/api/products").send({
        name: "Dell Laptop", sku: "LAP-001", category: category.body.data.category._id,
        costPrice: 40000, sellingPrice: 49999
    });
    const productId = product.body.data.product._id;
    await adminAgent.put(`/api/products/${productId}`).send({ sellingPrice: 54999 });
    return productId;
};

describe("Access: admin only", () => {
    test("ADMIN can read audit logs", async () => {
        expect((await adminAgent.get("/api/audit-logs")).status).toBe(200);
    });

    test("MANAGER, STAFF and SUPPLIER get 403; not logged in → 401", async () => {
        expect((await managerAgent.get("/api/audit-logs")).status).toBe(403);
        expect((await staffAgent.get("/api/audit-logs")).status).toBe(403);
        expect((await supplierAgent.get("/api/audit-logs")).status).toBe(403);
        expect((await request(app).get("/api/audit-logs")).status).toBe(401);
    });
});

describe("GET /api/audit-logs", () => {
    test("real actions appear, newest first, with who did them", async () => {
        await createAndEditLaptop();
        const response = await adminAgent.get("/api/audit-logs");
        const logs = response.body.data.auditLogs;

        // Logins from beforeEach + category + product created + product updated
        expect(logs.slice(0, 3).map((log) => log.action)).toEqual(["PRODUCT_UPDATED", "PRODUCT_CREATED", "CATEGORY_CREATED"]);
        expect(logs[0].user).toMatchObject({ name: "Admin", email: "admin@shop.com", role: "ADMIN" });
        expect(logs[0].user.password).toBeUndefined();
    });

    test("one record's full history, oldest first, with what changed", async () => {
        const productId = await createAndEditLaptop();

        const response = await adminAgent.get(`/api/audit-logs?entityType=Product&entityId=${productId}&sort=oldest`);
        const history = response.body.data.auditLogs;

        expect(history.map((log) => log.action)).toEqual(["PRODUCT_CREATED", "PRODUCT_UPDATED"]);
        expect(history[1].oldValue).toEqual({ sellingPrice: 49999 });
        expect(history[1].newValue).toEqual({ sellingPrice: 54999 });
    });

    test("filter by user and by action", async () => {
        await createAndEditLaptop();

        const ravisLogs = await adminAgent.get(`/api/audit-logs?user=${(await User.findOne({ name: "Ravi" }))._id}`);
        const logins = await adminAgent.get("/api/audit-logs?action=LOGIN");

        expect(ravisLogs.body.data.auditLogs.map((log) => log.action)).toEqual(["LOGIN"]);
        expect(logins.body.data.pagination.total).toBe(4);   // the 4 logins in beforeEach
    });

    test("date range uses whole days in the business's time zone", async () => {
        const log = await AuditLog.create({ user: admin._id, action: "PRODUCT_UPDATED", entityType: "Product" });
        // Test setup only: move it to 1 Oct 01:30 India time (= 30 Sep 20:00 UTC).
        // This goes around the model on purpose; the model itself refuses updates.
        await AuditLog.collection.updateOne({ _id: log._id }, { $set: { createdAt: new Date("2026-09-30T20:00:00Z") } });

        const september = await adminAgent.get("/api/audit-logs?action=PRODUCT_UPDATED&from=2026-09-01&to=2026-09-30");
        const october = await adminAgent.get("/api/audit-logs?action=PRODUCT_UPDATED&from=2026-10-01&to=2026-10-01");

        expect(september.body.data.auditLogs).toHaveLength(0);
        expect(october.body.data.auditLogs).toHaveLength(1);
    });

    test("pagination", async () => {
        await createAndEditLaptop();
        const response = await adminAgent.get("/api/audit-logs?limit=2&page=2");

        expect(response.body.data.auditLogs).toHaveLength(2);
        expect(response.body.data.pagination).toEqual({ page: 2, limit: 2, total: 7, totalPages: 4 });
    });

    test.each([
        ["entityType=Banana", "entityType must be one of: User, Category, Product, Warehouse, Inventory, StockTransfer, Supplier, PurchaseOrder, Order"],
        ["action=drop table", "Action must look like PRODUCT_UPDATED"],
        ["sort=random", "sort must be newest or oldest"],
        ["from=2026-10-05&to=2026-10-01", "from cannot be after to"],
        ["user=abc", "Invalid id"]
    ])("?%s → 422", async (query, expectedMessage) => {
        const response = await adminAgent.get(`/api/audit-logs?${query}`);

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });
});

describe("GET /api/audit-logs/filters and /:id", () => {
    test("filters lists the actions and record types that exist", async () => {
        await createAndEditLaptop();
        const response = await adminAgent.get("/api/audit-logs/filters");

        expect(response.body.data).toEqual({
            actions: ["CATEGORY_CREATED", "LOGIN", "PRODUCT_CREATED", "PRODUCT_UPDATED"],
            entityTypes: ["Category", "Product", "User"]
        });
    });

    test("one entry by id; unknown → 404; malformed → 400", async () => {
        await createAndEditLaptop();
        const latest = await AuditLog.findOne({ action: "PRODUCT_UPDATED" });

        const found = await adminAgent.get(`/api/audit-logs/${latest._id}`);
        expect(found.body.data.auditLog).toMatchObject({ action: "PRODUCT_UPDATED", user: { name: "Admin" } });

        expect((await adminAgent.get("/api/audit-logs/000000000000000000000000")).body.error).toBe("AUDIT_LOG_NOT_FOUND");
        expect((await adminAgent.get("/api/audit-logs/abc")).status).toBe(400);
    });
});

describe("Append-only", () => {
    test("there are no routes to create, change or delete audit logs", async () => {
        const log = await AuditLog.findOne();

        expect((await adminAgent.post("/api/audit-logs").send({ action: "FAKE" })).status).toBe(404);
        expect((await adminAgent.put(`/api/audit-logs/${log._id}`).send({ action: "FAKE" })).status).toBe(404);
        expect((await adminAgent.delete(`/api/audit-logs/${log._id}`)).status).toBe(404);
    });

    test("the model itself refuses updates and deletes (only create works)", async () => {
        const log = await AuditLog.create({ action: "TEST", entityType: "Product" });
        const blocked = "Audit logs are append-only: they cannot be changed or deleted";

        await expect(AuditLog.updateOne({ _id: log._id }, { action: "HACKED" })).rejects.toThrow(blocked);
        await expect(AuditLog.findByIdAndUpdate(log._id, { action: "HACKED" })).rejects.toThrow(blocked);
        await expect(AuditLog.deleteMany({})).rejects.toThrow(blocked);
        await expect(log.deleteOne()).rejects.toThrow(blocked);
        log.action = "HACKED";
        await expect(log.save()).rejects.toThrow(blocked);

        const stored = await AuditLog.findById(log._id);
        expect(stored.action).toBe("TEST");
    });
});

describe("Privacy: passwords never reach the audit log", () => {
    test("register, login, change password and admin reset leave no password or hash behind", async () => {
        const plainPasswords = ["NewUser123", "Changed456", "Reset7890", TEST_PASSWORD];

        await request(app).post("/api/auth/register").send({ name: "New User", email: "new@shop.com", password: "NewUser123" });
        const staff = await User.findOne({ email: "staff@shop.com" });
        await staffAgent.put("/api/users/profile/password").send({ currentPassword: TEST_PASSWORD, newPassword: "Changed456" });
        await adminAgent.put(`/api/users/${staff._id}/password`).send({ newPassword: "Reset7890" });
        await request(app).post("/api/auth/login").send({ email: "staff@shop.com", password: "Reset7890" });

        const everything = JSON.stringify(await AuditLog.find().lean());

        expect(everything).toContain("PASSWORD_CHANGED");
        expect(everything).toContain("USER_PASSWORD_RESET");
        for (const password of plainPasswords) {
            expect(everything).not.toContain(password);
        }
        // bcrypt hashes start with "$2a$" / "$2b$"
        expect(everything).not.toMatch(/\$2[aby]\$/);
    });
});

const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let adminAgent;
let managerAgent;
let staffAgent;
let supplierAgent;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Category.init(), Product.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com" });
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

describe("Access control", () => {
    test("not logged in → 401", async () => {
        expect((await request(app).get("/api/categories")).status).toBe(401);
    });

    test("ADMIN, MANAGER and STAFF can view; SUPPLIER cannot", async () => {
        expect((await adminAgent.get("/api/categories")).status).toBe(200);
        expect((await managerAgent.get("/api/categories")).status).toBe(200);
        expect((await staffAgent.get("/api/categories")).status).toBe(200);
        expect((await supplierAgent.get("/api/categories")).status).toBe(403);
    });

    test("MANAGER and STAFF cannot create categories", async () => {
        expect((await managerAgent.post("/api/categories").send({ name: "Toys" })).status).toBe(403);
        expect((await staffAgent.post("/api/categories").send({ name: "Toys" })).status).toBe(403);
    });
});

describe("Create and list", () => {
    test("admin creates a category (ACTIVE) and it is audited", async () => {
        const response = await adminAgent
            .post("/api/categories")
            .send({ name: "  Electronics ", description: "Phones, laptops" });

        expect(response.status).toBe(201);
        expect(response.body.data.category).toMatchObject({ name: "Electronics", status: RECORD_STATUS.ACTIVE });
        expect(await AuditLog.countDocuments({ action: "CATEGORY_CREATED" })).toBe(1);
    });

    test("duplicate name ignoring case → 409", async () => {
        await adminAgent.post("/api/categories").send({ name: "Electronics" });
        const response = await adminAgent.post("/api/categories").send({ name: "ELECTRONICS" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("CATEGORY_EXISTS");
    });

    test("missing name → 422", async () => {
        const response = await adminAgent.post("/api/categories").send({});

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Category name is required");
    });

    test("list is sorted by name and supports search, status and pagination", async () => {
        await Category.create([
            { name: "Toys" },
            { name: "Electronics" },
            { name: "Grocery", status: RECORD_STATUS.INACTIVE }
        ]);

        const all = await staffAgent.get("/api/categories");
        const search = await staffAgent.get("/api/categories?search=elec");
        const active = await staffAgent.get("/api/categories?status=ACTIVE");
        const page2 = await staffAgent.get("/api/categories?limit=2&page=2");

        expect(all.body.data.categories.map((c) => c.name)).toEqual(["Electronics", "Grocery", "Toys"]);
        expect(search.body.data.categories.map((c) => c.name)).toEqual(["Electronics"]);
        expect(active.body.data.categories).toHaveLength(2);
        expect(page2.body.data.categories.map((c) => c.name)).toEqual(["Toys"]);
        expect(page2.body.data.pagination.totalPages).toBe(2);
    });
});

describe("Update and deactivate", () => {
    let category;

    beforeEach(async () => {
        category = await Category.create({ name: "Electronics" });
    });

    test("rename is audited with only the changed field", async () => {
        const response = await adminAgent.put(`/api/categories/${category._id}`).send({ name: "Electronic Goods" });
        const auditLog = await AuditLog.findOne({ action: "CATEGORY_UPDATED" });

        expect(response.status).toBe(200);
        expect(auditLog.oldValue).toEqual({ name: "Electronics" });
        expect(auditLog.newValue).toEqual({ name: "Electronic Goods" });
    });

    test("renaming to its own name in different case is allowed", async () => {
        const response = await adminAgent.put(`/api/categories/${category._id}`).send({ name: "ELECTRONICS" });

        expect(response.status).toBe(200);
    });

    test("renaming to another category's name → 409", async () => {
        await Category.create({ name: "Toys" });
        const response = await adminAgent.put(`/api/categories/${category._id}`).send({ name: "toys" });

        expect(response.status).toBe(409);
    });

    test("DELETE deactivates an unused category", async () => {
        const response = await adminAgent.delete(`/api/categories/${category._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.category.status).toBe(RECORD_STATUS.INACTIVE);
        expect(await Category.countDocuments()).toBe(1);
    });

    test("cannot deactivate a category that has active products (DELETE or PUT)", async () => {
        await Product.create({ name: "Laptop", sku: "LAP-1", category: category._id, costPrice: 1, sellingPrice: 2 });

        const byDelete = await adminAgent.delete(`/api/categories/${category._id}`);
        const byPut = await adminAgent.put(`/api/categories/${category._id}`).send({ status: RECORD_STATUS.INACTIVE });

        expect(byDelete.status).toBe(409);
        expect(byDelete.body.error).toBe("CATEGORY_IN_USE");
        expect(byPut.status).toBe(409);
    });

    test("CAN deactivate when its products are all inactive", async () => {
        await Product.create({
            name: "Old Phone", sku: "OLD-1", category: category._id, costPrice: 1, sellingPrice: 2,
            status: RECORD_STATUS.INACTIVE
        });

        const response = await adminAgent.delete(`/api/categories/${category._id}`);
        expect(response.status).toBe(200);
    });

    test("unknown id → 404, malformed id → 400", async () => {
        expect((await adminAgent.delete("/api/categories/000000000000000000000000")).status).toBe(404);
        expect((await adminAgent.delete("/api/categories/abc")).status).toBe(400);
    });
});

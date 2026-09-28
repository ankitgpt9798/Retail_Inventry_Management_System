const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Warehouse = require("../../src/models/Warehouse");
const Inventory = require("../../src/models/Inventory");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS, USER_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let adminAgent;
let managerAgent;
let staffAgent;
let supplierAgent;
let manager;
let staff;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Warehouse.init(), Inventory.init(), Product.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
    manager = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com", name: "Ravi Manager" });
    staff = await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");
});

afterAll(async () => {
    await closeTestDB();
});

const delhiBody = () => ({
    name: "Delhi Central",
    code: "del-01",
    address: "Plot 12, Okhla Phase 2",
    city: "Delhi",
    state: "Delhi",
    capacity: 1000
});

// Puts stock straight into the database (the inventory API comes in Step 8)
const addStock = async (warehouseId, quantity, reservedQuantity = 0) => {
    const category = await Category.findOne() || await Category.create({ name: "Electronics" });
    const count = await Product.countDocuments();
    const product = await Product.create({
        name: `Product ${count}`, sku: `P-${count}`, category: category._id, costPrice: 1, sellingPrice: 2
    });
    return Inventory.create({ product: product._id, warehouse: warehouseId, quantity, reservedQuantity });
};

describe("Access control", () => {
    test("ADMIN, MANAGER, STAFF can view; SUPPLIER cannot", async () => {
        expect((await adminAgent.get("/api/warehouses")).status).toBe(200);
        expect((await managerAgent.get("/api/warehouses")).status).toBe(200);
        expect((await staffAgent.get("/api/warehouses")).status).toBe(200);
        expect((await supplierAgent.get("/api/warehouses")).status).toBe(403);
    });

    test("MANAGER can create; STAFF cannot", async () => {
        expect((await managerAgent.post("/api/warehouses").send(delhiBody())).status).toBe(201);
        expect((await staffAgent.post("/api/warehouses").send({ ...delhiBody(), code: "X-1" })).status).toBe(403);
    });

    test("STAFF cannot edit or deactivate", async () => {
        const warehouse = await Warehouse.create(delhiBody());

        expect((await staffAgent.put(`/api/warehouses/${warehouse._id}`).send({ capacity: 5 })).status).toBe(403);
        expect((await staffAgent.delete(`/api/warehouses/${warehouse._id}`)).status).toBe(403);
    });
});

describe("POST /api/warehouses", () => {
    test("creates an ACTIVE warehouse with an uppercase code and audits it", async () => {
        const response = await adminAgent.post("/api/warehouses").send(delhiBody());

        expect(response.status).toBe(201);
        expect(response.body.data.warehouse).toMatchObject({ code: "DEL-01", status: RECORD_STATUS.ACTIVE, capacity: 1000 });
        expect(await AuditLog.countDocuments({ action: "WAREHOUSE_CREATED" })).toBe(1);
    });

    test("can assign a manager on creation (name and email are returned)", async () => {
        const response = await adminAgent.post("/api/warehouses").send({ ...delhiBody(), manager: manager._id.toString() });

        expect(response.status).toBe(201);
        expect(response.body.data.warehouse.manager).toMatchObject({ name: "Ravi Manager", email: "manager@shop.com" });
    });

    test("duplicate code (any case) → 409", async () => {
        await adminAgent.post("/api/warehouses").send(delhiBody());
        const response = await adminAgent.post("/api/warehouses").send({ ...delhiBody(), name: "Other", code: "DEL-01" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("WAREHOUSE_CODE_EXISTS");
    });

    test.each([
        ["missing city", { city: undefined }, "City is required"],
        ["missing capacity", { capacity: undefined }, "Capacity must be a number"],
        ["capacity 0", { capacity: 0 }, "Capacity must be at least 1"],
        ["decimal capacity", { capacity: 10.5 }, "Capacity must be a whole number"],
        ["code with spaces", { code: "DEL 01" }, "Warehouse code can only contain letters, numbers and dashes"]
    ])("%s → 422", async (label, override, expectedMessage) => {
        const response = await adminAgent.post("/api/warehouses").send({ ...delhiBody(), ...override });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });

    test("STAFF user as manager → 422", async () => {
        const response = await adminAgent.post("/api/warehouses").send({ ...delhiBody(), manager: staff._id.toString() });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Warehouse manager must be an INVENTORY_MANAGER or ADMIN");
    });

    test("inactive manager → 422", async () => {
        await User.updateOne({ _id: manager._id }, { status: USER_STATUS.INACTIVE });
        const response = await adminAgent.post("/api/warehouses").send({ ...delhiBody(), manager: manager._id.toString() });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Warehouse manager must be an active user");
    });

    test("manager that doesn't exist → 404", async () => {
        const response = await adminAgent
            .post("/api/warehouses")
            .send({ ...delhiBody(), manager: "000000000000000000000000" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("MANAGER_NOT_FOUND");
    });
});

describe("GET /api/warehouses", () => {
    beforeEach(async () => {
        await Warehouse.create([
            { name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000, manager: manager._id },
            { name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 500 },
            { name: "Mumbai Port", code: "MUM-01", city: "Mumbai", capacity: 2000, status: RECORD_STATUS.INACTIVE }
        ]);
    });

    const names = (response) => response.body.data.warehouses.map((w) => w.name);

    test("sorted by name, with pagination", async () => {
        const response = await staffAgent.get("/api/warehouses");

        expect(names(response)).toEqual(["Delhi Central", "Mumbai Port", "Noida Hub"]);
        expect(response.body.data.pagination.total).toBe(3);
    });

    test("search matches name, code or city", async () => {
        expect(names(await staffAgent.get("/api/warehouses?search=hub"))).toEqual(["Noida Hub"]);
        expect(names(await staffAgent.get("/api/warehouses?search=mum-"))).toEqual(["Mumbai Port"]);
    });

    test("filter by city, status and manager", async () => {
        expect(names(await staffAgent.get("/api/warehouses?city=delhi"))).toEqual(["Delhi Central"]);
        expect(names(await staffAgent.get("/api/warehouses?status=ACTIVE"))).toEqual(["Delhi Central", "Noida Hub"]);
        expect(names(await staffAgent.get(`/api/warehouses?manager=${manager._id}`))).toEqual(["Delhi Central"]);
    });
});

describe("GET /api/warehouses/:id (with stock summary)", () => {
    test("empty warehouse → all zeros", async () => {
        const warehouse = await Warehouse.create(delhiBody());
        const response = await staffAgent.get(`/api/warehouses/${warehouse._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.stockSummary).toEqual({
            totalQuantity: 0,
            reservedQuantity: 0,
            productCount: 0,
            availableQuantity: 0,
            capacityUsedPercent: 0
        });
    });

    test("adds up stock across products and calculates % of capacity", async () => {
        const warehouse = await Warehouse.create(delhiBody());
        await addStock(warehouse._id, 300, 50);
        await addStock(warehouse._id, 125);
        await addStock(warehouse._id, 0);

        const response = await staffAgent.get(`/api/warehouses/${warehouse._id}`);

        expect(response.body.data.stockSummary).toEqual({
            totalQuantity: 425,
            reservedQuantity: 50,
            productCount: 2,
            availableQuantity: 375,
            capacityUsedPercent: 42.5
        });
    });

    test("stock in OTHER warehouses is not counted", async () => {
        const delhi = await Warehouse.create(delhiBody());
        const noida = await Warehouse.create({ ...delhiBody(), name: "Noida", code: "NOI-01" });
        await addStock(noida._id, 200);

        const response = await staffAgent.get(`/api/warehouses/${delhi._id}`);
        expect(response.body.data.stockSummary.totalQuantity).toBe(0);
    });

    test("unknown id → 404", async () => {
        const response = await staffAgent.get("/api/warehouses/000000000000000000000000");

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("WAREHOUSE_NOT_FOUND");
    });
});

describe("PUT /api/warehouses/:id", () => {
    let warehouse;

    beforeEach(async () => {
        warehouse = await Warehouse.create(delhiBody());
    });

    test("assign a manager, then remove them with null (both audited)", async () => {
        const assign = await managerAgent.put(`/api/warehouses/${warehouse._id}`).send({ manager: manager._id.toString() });
        const remove = await managerAgent.put(`/api/warehouses/${warehouse._id}`).send({ manager: null });
        const auditLogs = await AuditLog.find({ action: "WAREHOUSE_UPDATED" }).sort({ createdAt: 1 });

        expect(assign.body.data.warehouse.manager.name).toBe("Ravi Manager");
        expect(remove.body.data.warehouse.manager).toBeNull();
        expect(auditLogs.map((log) => log.newValue.manager)).toEqual([manager._id.toString(), null]);
    });

    test("capacity cannot go below current stock", async () => {
        await addStock(warehouse._id, 300);

        const tooSmall = await adminAgent.put(`/api/warehouses/${warehouse._id}`).send({ capacity: 299 });
        const justEnough = await adminAgent.put(`/api/warehouses/${warehouse._id}`).send({ capacity: 300 });

        expect(tooSmall.status).toBe(409);
        expect(tooSmall.body.error).toBe("CAPACITY_BELOW_STOCK");
        expect(justEnough.status).toBe(200);
    });

    test("cannot take another warehouse's code", async () => {
        await Warehouse.create({ ...delhiBody(), name: "Noida", code: "NOI-01" });
        const response = await adminAgent.put(`/api/warehouses/${warehouse._id}`).send({ code: "noi-01" });

        expect(response.status).toBe(409);
    });

    test("setting status INACTIVE with stock inside → 409", async () => {
        await addStock(warehouse._id, 10);
        const response = await adminAgent.put(`/api/warehouses/${warehouse._id}`).send({ status: RECORD_STATUS.INACTIVE });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("WAREHOUSE_HAS_STOCK");
    });

    test("reactivating an inactive warehouse works", async () => {
        await Warehouse.updateOne({ _id: warehouse._id }, { status: RECORD_STATUS.INACTIVE });
        const response = await adminAgent.put(`/api/warehouses/${warehouse._id}`).send({ status: RECORD_STATUS.ACTIVE });

        expect(response.status).toBe(200);
        expect(response.body.data.warehouse.status).toBe(RECORD_STATUS.ACTIVE);
    });
});

describe("DELETE /api/warehouses/:id", () => {
    test("deactivates an empty warehouse (kept in the database)", async () => {
        const warehouse = await Warehouse.create(delhiBody());
        const response = await managerAgent.delete(`/api/warehouses/${warehouse._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.warehouse.status).toBe(RECORD_STATUS.INACTIVE);
        expect(await Warehouse.countDocuments()).toBe(1);
        expect(await AuditLog.countDocuments({ action: "WAREHOUSE_DEACTIVATED" })).toBe(1);
    });

    test("warehouse with stock cannot be deactivated", async () => {
        const warehouse = await Warehouse.create(delhiBody());
        await addStock(warehouse._id, 5);

        const response = await adminAgent.delete(`/api/warehouses/${warehouse._id}`);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe(
            "Cannot deactivate: the warehouse still holds 5 unit(s). Transfer the stock out first."
        );
    });

    test("inventory rows with 0 quantity do not block deactivation", async () => {
        const warehouse = await Warehouse.create(delhiBody());
        await addStock(warehouse._id, 0);

        expect((await adminAgent.delete(`/api/warehouses/${warehouse._id}`)).status).toBe(200);
    });
});

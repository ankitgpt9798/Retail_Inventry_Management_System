const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Inventory = require("../../src/models/Inventory");
const StockTransaction = require("../../src/models/StockTransaction");
const Notification = require("../../src/models/Notification");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS, USER_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let admin;
let manager;
let adminAgent;
let managerAgent;
let staffAgent;
let supplierAgent;
let keyboard;
let laptop;
let delhi;
let noida;
let mumbai;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    admin = await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
    manager = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com", name: "Ravi" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");

    const category = await Category.create({ name: "Electronics" });
    keyboard = await Product.create({
        name: "Keyboard K100", sku: "KEY-K100", category: category._id, costPrice: 600, sellingPrice: 899, reorderLevel: 20
    });
    laptop = await Product.create({
        name: "Dell Laptop", sku: "LAP-001", category: category._id, costPrice: 42000, sellingPrice: 49999, reorderLevel: 5
    });
    delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000 });
    noida = await Warehouse.create({ name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 1000 });
    mumbai = await Warehouse.create({ name: "Mumbai Port", code: "MUM-01", city: "Mumbai", capacity: 1000 });
});

afterAll(async () => {
    await closeTestDB();
});

const stockIn = (agent, product, warehouse, quantity, note) =>
    agent.post("/api/inventory/stock-in").send({
        product: product._id.toString(), warehouse: warehouse._id.toString(), quantity, note
    });

const stockOut = (agent, product, warehouse, quantity, note = "Damaged in handling") =>
    agent.post("/api/inventory/stock-out").send({
        product: product._id.toString(), warehouse: warehouse._id.toString(), quantity, note
    });

describe("Access control", () => {
    test("STAFF can view inventory but cannot stock in or out", async () => {
        expect((await staffAgent.get("/api/inventory")).status).toBe(200);
        expect((await stockIn(staffAgent, keyboard, delhi, 10)).status).toBe(403);
        expect((await stockOut(staffAgent, keyboard, delhi, 1)).status).toBe(403);
    });

    test("SUPPLIER cannot view inventory", async () => {
        expect((await supplierAgent.get("/api/inventory")).status).toBe(403);
        expect((await supplierAgent.get("/api/inventory/low-stock")).status).toBe(403);
    });

    test("ADMIN and MANAGER can stock in", async () => {
        expect((await stockIn(adminAgent, keyboard, delhi, 10)).status).toBe(200);
        expect((await stockIn(managerAgent, keyboard, delhi, 10)).status).toBe(200);
    });
});

describe("POST /api/inventory/stock-in (Rule 3)", () => {
    test("first stock-in creates the row with the product's reorder level", async () => {
        const response = await stockIn(managerAgent, keyboard, delhi, 100, "Opening stock");
        const inventory = response.body.data.inventory;

        expect(response.status).toBe(200);
        expect(inventory).toMatchObject({
            quantity: 100,
            reservedQuantity: 0,
            availableQuantity: 100,
            reorderLevel: 20,
            product: { sku: "KEY-K100" },
            warehouse: { code: "DEL-01" }
        });
    });

    test("second stock-in adds to the same row", async () => {
        await stockIn(managerAgent, keyboard, delhi, 100);
        const response = await stockIn(managerAgent, keyboard, delhi, 50);

        expect(response.body.data.inventory.quantity).toBe(150);
        expect(await Inventory.countDocuments()).toBe(1);
    });

    test("writes a STOCK_IN transaction (Rule 9) and an audit record (Rule 8)", async () => {
        await stockIn(managerAgent, keyboard, delhi, 100);
        await stockIn(managerAgent, keyboard, delhi, 50, "Supplier delivery");

        const transaction = await StockTransaction.findOne().sort({ createdAt: -1 });
        expect(transaction).toMatchObject({
            type: "STOCK_IN",
            quantity: 50,
            quantityBefore: 100,
            quantityAfter: 150,
            referenceType: "MANUAL",
            note: "Supplier delivery"
        });
        expect(transaction.performedBy.toString()).toBe(manager._id.toString());
        expect(await AuditLog.countDocuments({ action: "STOCK_IN", entityType: "Inventory" })).toBe(2);
    });

    test("cannot exceed warehouse capacity (counts ALL products in the warehouse)", async () => {
        await stockIn(managerAgent, keyboard, delhi, 900);
        const response = await stockIn(managerAgent, laptop, delhi, 101);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("CAPACITY_EXCEEDED");
        expect(response.body.message).toBe("DEL-01 can hold 1000 units and has 900; only 100 more will fit");
        expect((await stockIn(managerAgent, laptop, delhi, 100)).status).toBe(200);
    });

    test("inactive product → 422", async () => {
        await Product.updateOne({ _id: keyboard._id }, { status: RECORD_STATUS.INACTIVE });
        const response = await stockIn(managerAgent, keyboard, delhi, 10);

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("PRODUCT_INACTIVE");
    });

    test("inactive warehouse → 422", async () => {
        await Warehouse.updateOne({ _id: delhi._id }, { status: RECORD_STATUS.INACTIVE });
        const response = await stockIn(managerAgent, keyboard, delhi, 10);

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("WAREHOUSE_INACTIVE");
    });

    test("product or warehouse that doesn't exist → 404", async () => {
        const fake = { _id: "000000000000000000000000" };

        expect((await stockIn(managerAgent, fake, delhi, 10)).body.error).toBe("PRODUCT_NOT_FOUND");
        expect((await stockIn(managerAgent, keyboard, fake, 10)).body.error).toBe("WAREHOUSE_NOT_FOUND");
    });

    test.each([
        ["zero", 0, "Quantity must be at least 1"],
        ["negative", -5, "Quantity must be at least 1"],
        ["decimal", 2.5, "Quantity must be a whole number"],
        ["text", "10", "Quantity must be a number"]
    ])("%s quantity → 422", async (label, quantity, expectedMessage) => {
        const response = await stockIn(managerAgent, keyboard, delhi, quantity);

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });
});

describe("POST /api/inventory/stock-out", () => {
    beforeEach(async () => {
        await stockIn(managerAgent, keyboard, delhi, 50);
    });

    test("removes stock and records a STOCK_OUT transaction", async () => {
        const response = await stockOut(managerAgent, keyboard, delhi, 8, "Water damage");
        const transaction = await StockTransaction.findOne({ type: "STOCK_OUT" });

        expect(response.status).toBe(200);
        expect(response.body.data.inventory.quantity).toBe(42);
        expect(transaction).toMatchObject({ quantity: 8, quantityBefore: 50, quantityAfter: 42, note: "Water damage" });
    });

    test("more than available → 400 INSUFFICIENT_STOCK, nothing changes", async () => {
        const response = await stockOut(managerAgent, keyboard, delhi, 51);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            message: "Insufficient stock of KEY-K100 in DEL-01: 50 available, 51 requested",
            error: "INSUFFICIENT_STOCK"
        });
        expect((await Inventory.findOne()).quantity).toBe(50);
        expect(await StockTransaction.countDocuments({ type: "STOCK_OUT" })).toBe(0);
    });

    test("reserved units cannot be removed", async () => {
        await Inventory.updateOne({ product: keyboard._id }, { reservedQuantity: 45 });

        const tooMany = await stockOut(managerAgent, keyboard, delhi, 6);
        const allowed = await stockOut(managerAgent, keyboard, delhi, 5);

        expect(tooMany.status).toBe(400);
        expect(tooMany.body.message).toContain("5 available");
        expect(allowed.status).toBe(200);
    });

    test("product never stocked in this warehouse → 400 with 0 available", async () => {
        const response = await stockOut(managerAgent, keyboard, noida, 1);

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("0 available");
    });

    test("a reason (note) is required", async () => {
        const response = await managerAgent.post("/api/inventory/stock-out").send({
            product: keyboard._id.toString(), warehouse: delhi._id.toString(), quantity: 1
        });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].field).toBe("note");
    });

    test("an INACTIVE product's stock can still be removed", async () => {
        await Product.updateOne({ _id: keyboard._id }, { status: RECORD_STATUS.INACTIVE });

        expect((await stockOut(managerAgent, keyboard, delhi, 50, "Clearing discontinued item")).status).toBe(200);
    });

    test("RACE: 10 requests for 1 unit each, only 5 units available → exactly 5 succeed", async () => {
        await stockOut(managerAgent, keyboard, delhi, 45);

        const responses = await Promise.all(
            Array.from({ length: 10 }, () => stockOut(managerAgent, keyboard, delhi, 1))
        );
        const statuses = responses.map((r) => r.status);

        expect(statuses.filter((s) => s === 200)).toHaveLength(5);
        expect(statuses.filter((s) => s === 400)).toHaveLength(5);
        expect((await Inventory.findOne()).quantity).toBe(0);
        expect(await StockTransaction.countDocuments({ type: "STOCK_OUT" })).toBe(6);
    });
});

describe("Low-stock alerts (Rule 7)", () => {
    beforeEach(async () => {
        // Keyboard reorder level is 20
        await stockIn(managerAgent, keyboard, delhi, 25);
    });

    test("crossing below the level notifies every ACTIVE admin and manager, not staff", async () => {
        await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "old@shop.com", status: USER_STATUS.INACTIVE });

        await stockOut(managerAgent, keyboard, delhi, 10);
        const notifications = await Notification.find({ type: "LOW_STOCK" });
        const recipients = notifications.map((n) => n.recipient.toString()).sort();

        expect(recipients).toEqual([admin._id.toString(), manager._id.toString()].sort());
        expect(notifications[0].message).toBe(
            "Keyboard K100 (KEY-K100) is below reorder level in DEL-01: 15 available, reorder level 20."
        );
    });

    test("no alert while staying above the level", async () => {
        await stockOut(managerAgent, keyboard, delhi, 5);

        expect(await Notification.countDocuments()).toBe(0);
    });

    test("no second alert while already low", async () => {
        await stockOut(managerAgent, keyboard, delhi, 10);
        await stockOut(managerAgent, keyboard, delhi, 3);

        expect(await Notification.countDocuments({ type: "LOW_STOCK" })).toBe(2);
    });

    test("alert again after being restocked and dropping again", async () => {
        await stockOut(managerAgent, keyboard, delhi, 10);
        await stockIn(managerAgent, keyboard, delhi, 30);
        await stockOut(managerAgent, keyboard, delhi, 30);

        expect(await Notification.countDocuments({ type: "LOW_STOCK" })).toBe(4);
    });

    test("GET /low-stock lists only low rows, and can filter by warehouse", async () => {
        await stockIn(managerAgent, keyboard, noida, 5);
        await stockIn(managerAgent, laptop, delhi, 50);

        const all = await staffAgent.get("/api/inventory/low-stock");
        const noidaOnly = await staffAgent.get(`/api/inventory/low-stock?warehouse=${noida._id}`);

        expect(all.body.data.inventories.map((i) => i.warehouse.code)).toEqual(["NOI-01"]);
        expect(noidaOnly.body.data.inventories).toHaveLength(1);

        await stockOut(managerAgent, keyboard, delhi, 10);
        const afterDrop = await staffAgent.get("/api/inventory/low-stock");
        expect(afterDrop.body.data.pagination.total).toBe(2);
    });
});

describe("Views", () => {
    test("product-wise: Laptop Delhi 100, Noida 50, Mumbai 75 → total 225 (spec example)", async () => {
        await stockIn(managerAgent, laptop, delhi, 100);
        await stockIn(managerAgent, laptop, noida, 50);
        await stockIn(managerAgent, laptop, mumbai, 75);
        await Inventory.updateOne({ product: laptop._id, warehouse: delhi._id }, { reservedQuantity: 10 });

        const response = await staffAgent.get(`/api/inventory/product/${laptop._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.warehouses.map((w) => [w.warehouse.code, w.quantity]))
            .toEqual([["DEL-01", 100], ["MUM-01", 75], ["NOI-01", 50]]);
        expect(response.body.data.totals).toEqual({ quantity: 225, reservedQuantity: 10, availableQuantity: 215 });
    });

    test("warehouse-wise list, search by product name or SKU, lowStock flag", async () => {
        await stockIn(managerAgent, keyboard, delhi, 100);
        await stockIn(managerAgent, laptop, delhi, 3);
        await stockIn(managerAgent, laptop, noida, 40);

        const delhiRows = await staffAgent.get(`/api/inventory?warehouse=${delhi._id}`);
        const searchRows = await staffAgent.get("/api/inventory?search=lap-");
        const lowRows = await staffAgent.get("/api/inventory?lowStock=true");
        const notFiltered = await staffAgent.get("/api/inventory?lowStock=false");

        expect(delhiRows.body.data.inventories).toHaveLength(2);
        expect(searchRows.body.data.inventories).toHaveLength(2);
        expect(lowRows.body.data.inventories.map((i) => i.product.sku)).toEqual(["LAP-001"]);
        expect(notFiltered.body.data.inventories).toHaveLength(3);
    });

    test("invalid lowStock value → 422", async () => {
        const response = await staffAgent.get("/api/inventory?lowStock=yes");

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("lowStock must be true or false");
    });

    test("GET /:id returns one record; unknown → 404", async () => {
        const created = await stockIn(managerAgent, keyboard, delhi, 10);

        const found = await staffAgent.get(`/api/inventory/${created.body.data.inventory._id}`);
        const missing = await staffAgent.get("/api/inventory/000000000000000000000000");

        expect(found.body.data.inventory.availableQuantity).toBe(10);
        expect(missing.status).toBe(404);
        expect(missing.body.error).toBe("INVENTORY_NOT_FOUND");
    });
});

describe("GET /api/inventory/transactions (history)", () => {
    test("newest first, filter by type and product, with who did it", async () => {
        await stockIn(managerAgent, keyboard, delhi, 50);
        await stockOut(adminAgent, keyboard, delhi, 5);
        await stockIn(managerAgent, laptop, delhi, 10);

        const all = await staffAgent.get("/api/inventory/transactions");
        const outs = await staffAgent.get("/api/inventory/transactions?type=STOCK_OUT");
        const keyboardOnly = await staffAgent.get(`/api/inventory/transactions?product=${keyboard._id}`);

        expect(all.body.data.transactions.map((t) => t.product.sku)).toEqual(["LAP-001", "KEY-K100", "KEY-K100"]);
        expect(outs.body.data.transactions[0].performedBy.name).toBe("Test User");
        expect(keyboardOnly.body.data.pagination.total).toBe(2);
    });

    test("date range filter and validation", async () => {
        await stockIn(managerAgent, keyboard, delhi, 50);

        const future = await staffAgent.get("/api/inventory/transactions?from=2099-01-01");
        const badRange = await staffAgent.get("/api/inventory/transactions?from=2026-10-01&to=2026-09-01");
        const badDate = await staffAgent.get("/api/inventory/transactions?from=abc");

        expect(future.body.data.transactions).toHaveLength(0);
        expect(badRange.body.message).toBe("from cannot be after to");
        expect(badDate.status).toBe(422);
    });
});

describe("PUT /api/inventory/:id/reorder-level", () => {
    test("updates the level for ONE warehouse and alerts if stock is now low", async () => {
        const delhiRow = (await stockIn(managerAgent, keyboard, delhi, 30)).body.data.inventory;
        await stockIn(managerAgent, keyboard, noida, 30);

        const response = await managerAgent.put(`/api/inventory/${delhiRow._id}/reorder-level`).send({ reorderLevel: 40 });
        const noidaRow = await Inventory.findOne({ warehouse: noida._id });

        expect(response.status).toBe(200);
        expect(response.body.data.inventory.reorderLevel).toBe(40);
        expect(noidaRow.reorderLevel).toBe(20);
        expect(await Notification.countDocuments({ type: "LOW_STOCK" })).toBe(2);
        expect(await AuditLog.countDocuments({ action: "REORDER_LEVEL_UPDATED" })).toBe(1);
    });

    test("STAFF cannot change it; negative → 422", async () => {
        const row = (await stockIn(managerAgent, keyboard, delhi, 30)).body.data.inventory;

        expect((await staffAgent.put(`/api/inventory/${row._id}/reorder-level`).send({ reorderLevel: 5 })).status).toBe(403);
        expect((await managerAgent.put(`/api/inventory/${row._id}/reorder-level`).send({ reorderLevel: -1 })).status).toBe(422);
    });
});

describe("Warehouse rules now use real inventory", () => {
    test("a warehouse with stock (added through the API) cannot be deactivated", async () => {
        await stockIn(managerAgent, keyboard, delhi, 10);

        const response = await adminAgent.delete(`/api/warehouses/${delhi._id}`);
        expect(response.status).toBe(409);
    });

    test("warehouse detail shows the stock summary", async () => {
        await stockIn(managerAgent, keyboard, delhi, 250);

        const response = await staffAgent.get(`/api/warehouses/${delhi._id}`);
        expect(response.body.data.stockSummary.capacityUsedPercent).toBe(25);
    });

    test("not logged in → 401", async () => {
        expect((await request(app).get("/api/inventory")).status).toBe(401);
    });
});

const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Supplier = require("../../src/models/Supplier");
const Inventory = require("../../src/models/Inventory");
const PurchaseOrder = require("../../src/models/PurchaseOrder");
const StockTransaction = require("../../src/models/StockTransaction");
const Notification = require("../../src/models/Notification");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let ravi;
let meena;
let suresh;
let raviAgent;
let meenaAgent;
let adminAgent;
let staffAgent;
let sureshAgent;
let otherSupplierAgent;
let acme;
let laptop;
let keyboard;
let delhi;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init(), PurchaseOrder.init(), Supplier.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    acme = await Supplier.create({ name: "Acme Electronics", email: "sales@acme.in" });
    const other = await Supplier.create({ name: "Other Traders", email: "sales@other.in" });

    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com", name: "Admin" });
    ravi = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "ravi@shop.com", name: "Ravi" });
    meena = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "meena@shop.com", name: "Meena" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    suresh = await createTestUser({ role: ROLES.SUPPLIER, email: "suresh@acme.in", name: "Suresh", supplier: acme._id });
    await createTestUser({ role: ROLES.SUPPLIER, email: "someone@other.in", supplier: other._id });

    adminAgent = await loginAgent("admin@shop.com");
    raviAgent = await loginAgent("ravi@shop.com");
    meenaAgent = await loginAgent("meena@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
    sureshAgent = await loginAgent("suresh@acme.in");
    otherSupplierAgent = await loginAgent("someone@other.in");

    const category = await Category.create({ name: "Electronics" });
    laptop = await Product.create({ name: "Dell Laptop", sku: "LAP-001", category: category._id, costPrice: 42000, sellingPrice: 49999 });
    keyboard = await Product.create({ name: "Keyboard K100", sku: "KEY-K100", category: category._id, costPrice: 600, sellingPrice: 899 });
    delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000 });
});

afterAll(async () => {
    await closeTestDB();
});

const poBody = (overrides = {}) => ({
    supplier: acme._id.toString(),
    warehouse: delhi._id.toString(),
    items: [
        { product: laptop._id.toString(), quantityOrdered: 100 },
        { product: keyboard._id.toString(), quantityOrdered: 50, unitCost: 550 }
    ],
    ...overrides
});

// Creates a PO (by Ravi) and walks it to the requested status
const poAt = async (status, body = poBody()) => {
    const created = await raviAgent.post("/api/purchases").send(body);
    const id = created.body.data.purchase._id;
    const steps = ["PENDING", "APPROVED", "ORDERED"];
    const target = steps.indexOf(status);
    if (target >= 0) await raviAgent.put(`/api/purchases/${id}/submit`);
    if (target >= 1) await meenaAgent.put(`/api/purchases/${id}/approve`);
    if (target >= 2) await raviAgent.put(`/api/purchases/${id}/order`);
    return id;
};

const receive = (agent, id, lines) =>
    agent.put(`/api/purchases/${id}/receive`).send({
        items: lines.map(([product, quantity]) => ({ product: product._id.toString(), quantity }))
    });

const stockOf = async (product) => {
    const inventory = await Inventory.findOne({ product: product._id, warehouse: delhi._id });
    return inventory ? inventory.quantity : 0;
};

describe("Access control", () => {
    test("STAFF cannot see purchases", async () => {
        expect((await staffAgent.get("/api/purchases")).status).toBe(403);
    });

    test("SUPPLIER cannot create or approve", async () => {
        expect((await sureshAgent.post("/api/purchases").send(poBody())).status).toBe(403);
        const id = await poAt("PENDING");
        expect((await sureshAgent.put(`/api/purchases/${id}/approve`)).status).toBe(403);
    });

    test("managers cannot use the supplier-only confirm action", async () => {
        const id = await poAt("ORDERED");
        expect((await raviAgent.put(`/api/purchases/${id}/confirm`).send({})).status).toBe(403);
    });

    test("not logged in → 401", async () => {
        expect((await request(app).get("/api/purchases")).status).toBe(401);
    });
});

describe("Create and edit (purchase request)", () => {
    test("creates a DRAFT with a PO number, default unit cost and calculated total", async () => {
        const response = await raviAgent.post("/api/purchases").send(poBody());
        const purchase = response.body.data.purchase;

        expect(response.status).toBe(201);
        expect(purchase).toMatchObject({
            poNumber: "PO-000001",
            status: "DRAFT",
            totalAmount: 100 * 42000 + 50 * 550,
            supplier: { name: "Acme Electronics" },
            warehouse: { code: "DEL-01" }
        });
        expect(purchase.items[0]).toMatchObject({
            product: { sku: "LAP-001" }, quantityOrdered: 100, unitCost: 42000, quantityReceived: 0, quantityOutstanding: 100
        });
    });

    test("submit: true goes straight to PENDING and tells OTHER managers/admins", async () => {
        const response = await raviAgent.post("/api/purchases").send(poBody({ submit: true }));
        const notified = await Notification.find({ title: "Purchase request needs approval" }).populate("recipient", "name");

        expect(response.body.data.purchase.status).toBe("PENDING");
        expect(notified.map((n) => n.recipient.name).sort()).toEqual(["Admin", "Meena"]);
    });

    test.each([
        ["no items", { items: [] }, "Purchase order must contain at least one item"],
        ["same product twice", {
            items: [{ product: "PLACEHOLDER", quantityOrdered: 1 }, { product: "PLACEHOLDER", quantityOrdered: 2 }]
        }, "Each product can appear only once; change its quantity instead"],
        ["zero quantity", { items: [{ product: "PLACEHOLDER", quantityOrdered: 0 }] }, "Quantity must be at least 1"]
    ])("%s → 422", async (label, override, expectedMessage) => {
        const body = JSON.parse(JSON.stringify(poBody(override)).replaceAll("PLACEHOLDER", laptop._id.toString()));
        const response = await raviAgent.post("/api/purchases").send(body);

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });

    test("inactive supplier, product or warehouse → 422", async () => {
        await Supplier.updateOne({ _id: acme._id }, { status: RECORD_STATUS.INACTIVE });
        expect((await raviAgent.post("/api/purchases").send(poBody())).body.error).toBe("SUPPLIER_INACTIVE");
        await Supplier.updateOne({ _id: acme._id }, { status: RECORD_STATUS.ACTIVE });

        await Product.updateOne({ _id: keyboard._id }, { status: RECORD_STATUS.INACTIVE });
        expect((await raviAgent.post("/api/purchases").send(poBody())).body.error).toBe("PRODUCT_INACTIVE");
        await Product.updateOne({ _id: keyboard._id }, { status: RECORD_STATUS.ACTIVE });

        await Warehouse.updateOne({ _id: delhi._id }, { status: RECORD_STATUS.INACTIVE });
        expect((await raviAgent.post("/api/purchases").send(poBody())).body.error).toBe("WAREHOUSE_INACTIVE");
    });

    test("a DRAFT can be edited (items replaced, total recalculated); after submit it cannot", async () => {
        const created = await raviAgent.post("/api/purchases").send(poBody());
        const id = created.body.data.purchase._id;

        const edited = await raviAgent.put(`/api/purchases/${id}`).send({
            items: [{ product: keyboard._id.toString(), quantityOrdered: 10 }]
        });
        expect(edited.body.data.purchase.totalAmount).toBe(6000);
        expect(edited.body.data.purchase.items).toHaveLength(1);

        await raviAgent.put(`/api/purchases/${id}/submit`);
        const tooLate = await raviAgent.put(`/api/purchases/${id}`).send({ notes: "change" });
        expect(tooLate.status).toBe(409);
        expect(tooLate.body.message).toBe("Purchase order PO-000001 is PENDING; it must be DRAFT to edit it");
    });
});

describe("Approval and ordering", () => {
    test("requester cannot approve their own request", async () => {
        const id = await poAt("PENDING");
        const response = await raviAgent.put(`/api/purchases/${id}/approve`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("SELF_APPROVAL_NOT_ALLOWED");
    });

    test("another manager approves; requester gets PURCHASE_APPROVED", async () => {
        const id = await poAt("PENDING");
        const response = await meenaAgent.put(`/api/purchases/${id}/approve`);
        const toRavi = await Notification.findOne({ recipient: ravi._id, type: "PURCHASE_APPROVED" });

        expect(response.body.data.purchase).toMatchObject({ status: "APPROVED", approvedBy: { name: "Meena" } });
        expect(toRavi).not.toBeNull();
    });

    test("cannot approve a DRAFT (must be submitted first)", async () => {
        const created = await raviAgent.post("/api/purchases").send(poBody());
        const response = await meenaAgent.put(`/api/purchases/${created.body.data.purchase._id}/approve`);

        expect(response.status).toBe(409);
    });

    test("reject needs a reason", async () => {
        const id = await poAt("PENDING");

        expect((await meenaAgent.put(`/api/purchases/${id}/reject`).send({})).status).toBe(422);
        const rejected = await meenaAgent.put(`/api/purchases/${id}/reject`).send({ reason: "Price too high" });
        expect(rejected.body.data.purchase).toMatchObject({ status: "REJECTED", rejectionReason: "Price too high" });
    });

    test("ordering notifies only the supplier's own portal users", async () => {
        await poAt("ORDERED");
        const notified = await Notification.find({ title: "New purchase order" }).populate("recipient", "email");

        expect(notified.map((n) => n.recipient.email)).toEqual(["suresh@acme.in"]);
    });
});

describe("Supplier portal", () => {
    test("suppliers see only their own POs, and only after they were ordered", async () => {
        await poAt("PENDING");
        const orderedId = await poAt("ORDERED");

        const list = await sureshAgent.get("/api/purchases");
        const otherList = await otherSupplierAgent.get("/api/purchases");

        expect(list.body.data.purchases.map((p) => p._id)).toEqual([orderedId]);
        expect(otherList.body.data.purchases).toHaveLength(0);
    });

    test("supplier filter in the URL cannot be used to peek at others", async () => {
        await poAt("ORDERED");
        const response = await otherSupplierAgent.get(`/api/purchases?supplier=${acme._id}`);

        expect(response.body.data.purchases).toHaveLength(0);
    });

    test("not-yet-ordered or other company's PO → 404 (not 403)", async () => {
        const pendingId = await poAt("PENDING");
        const orderedId = await poAt("ORDERED");

        expect((await sureshAgent.get(`/api/purchases/${pendingId}`)).status).toBe(404);
        expect((await otherSupplierAgent.get(`/api/purchases/${orderedId}`)).status).toBe(404);
        expect((await sureshAgent.get(`/api/purchases/${orderedId}`)).status).toBe(200);
    });

    test("confirm with a delivery date (once); requester is told", async () => {
        const id = await poAt("ORDERED");

        const confirmed = await sureshAgent.put(`/api/purchases/${id}/confirm`).send({
            expectedDeliveryDate: "2026-10-15", deliveryNote: "Two trucks"
        });
        const again = await sureshAgent.put(`/api/purchases/${id}/confirm`).send({});

        expect(confirmed.status).toBe(200);
        expect(confirmed.body.data.purchase).toMatchObject({
            deliveryNote: "Two trucks", supplierConfirmedBy: { name: "Suresh" }
        });
        expect(confirmed.body.data.purchase.expectedDeliveryDate).toMatch(/^2026-10-15/);
        expect(again.status).toBe(409);
        expect(again.body.error).toBe("ALREADY_CONFIRMED");
        expect(await Notification.countDocuments({ recipient: ravi._id, title: "Supplier confirmed order" })).toBe(1);
    });

    test("delivery update needs at least one field; another company cannot update", async () => {
        const id = await poAt("ORDERED");

        expect((await sureshAgent.put(`/api/purchases/${id}/delivery`).send({})).status).toBe(422);
        expect((await otherSupplierAgent.put(`/api/purchases/${id}/delivery`).send({ deliveryNote: "x" })).status).toBe(404);
        expect((await sureshAgent.put(`/api/purchases/${id}/delivery`).send({ deliveryNote: "Delayed by rain" })).status).toBe(200);
    });
});

describe("Receiving goods (partial and full)", () => {
    test("partial delivery: 60 of 100 laptops → PARTIALLY_RECEIVED, stock +60", async () => {
        const id = await poAt("ORDERED");
        const response = await receive(meenaAgent, id, [[laptop, 60]]);
        const purchase = response.body.data.purchase;

        expect(response.status).toBe(200);
        expect(purchase.status).toBe("PARTIALLY_RECEIVED");
        expect(purchase.items[0]).toMatchObject({ quantityReceived: 60, quantityOutstanding: 40 });
        expect(await stockOf(laptop)).toBe(60);
    });

    test("the rest arrives → RECEIVED with receivedAt; requester notified each time", async () => {
        const id = await poAt("ORDERED");
        await receive(meenaAgent, id, [[laptop, 60]]);
        const final = await receive(meenaAgent, id, [[laptop, 40], [keyboard, 50]]);

        expect(final.body.data.purchase.status).toBe("RECEIVED");
        expect(final.body.data.purchase.receivedAt).toBeDefined();
        expect(await stockOf(laptop)).toBe(100);
        expect(await stockOf(keyboard)).toBe(50);
        expect(await Notification.countDocuments({ recipient: ravi._id, type: "PURCHASE_RECEIVED" })).toBe(2);
    });

    test("stock transactions point back to the PO (Rule 9)", async () => {
        const id = await poAt("ORDERED");
        await receive(meenaAgent, id, [[laptop, 60], [keyboard, 10]]);
        const transactions = await StockTransaction.find({ referenceId: id });

        expect(transactions).toHaveLength(2);
        expect(transactions.every((t) => t.type === "STOCK_IN" && t.referenceType === "PURCHASE_ORDER")).toBe(true);
    });

    test("cannot receive more than is outstanding", async () => {
        const id = await poAt("ORDERED");
        await receive(meenaAgent, id, [[laptop, 60]]);
        const response = await receive(meenaAgent, id, [[laptop, 41]]);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Only 40 of LAP-001 are still outstanding on PO-000001");
        expect(await stockOf(laptop)).toBe(60);
    });

    test("product that is not on the PO → 422", async () => {
        const mouse = await Product.create({ name: "Mouse", sku: "MOU-1", category: laptop.category, costPrice: 1, sellingPrice: 2 });
        const id = await poAt("ORDERED");

        expect((await receive(meenaAgent, id, [[mouse, 1]])).body.error).toBe("PRODUCT_NOT_IN_PURCHASE");
    });

    test("cannot receive before the PO was ordered", async () => {
        const id = await poAt("APPROVED");

        expect((await receive(meenaAgent, id, [[laptop, 1]])).status).toBe(409);
    });

    test("delivery that doesn't fit the warehouse → 409, nothing received", async () => {
        await Warehouse.updateOne({ _id: delhi._id }, { capacity: 120 });
        const id = await poAt("ORDERED");

        const response = await receive(meenaAgent, id, [[laptop, 100], [keyboard, 50]]);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("CAPACITY_EXCEEDED");
        expect((await PurchaseOrder.findById(id)).status).toBe("ORDERED");
        expect(await stockOf(laptop)).toBe(0);
    });

    test("a product deactivated after ordering can still be received", async () => {
        const id = await poAt("ORDERED");
        await Product.updateOne({ _id: laptop._id }, { status: RECORD_STATUS.INACTIVE });

        expect((await receive(meenaAgent, id, [[laptop, 100]])).status).toBe(200);
    });

    test("if the stock step fails, the PO is put back to match the real stock", async () => {
        const id = await poAt("ORDERED");
        // Simulate an unexpected failure inside addStock
        await Warehouse.updateOne({ _id: delhi._id }, { status: RECORD_STATUS.INACTIVE });

        const response = await receive(meenaAgent, id, [[laptop, 60], [keyboard, 10]]);
        const purchase = await PurchaseOrder.findById(id);

        expect(response.status).toBe(422);
        expect(purchase.status).toBe("ORDERED");
        expect(purchase.items.map((item) => item.quantityReceived)).toEqual([0, 0]);
    });

    test("RACE: two people record the last 40 laptops at the same moment → received only once", async () => {
        const id = await poAt("ORDERED");
        await receive(meenaAgent, id, [[laptop, 60]]);

        const responses = await Promise.all([
            receive(meenaAgent, id, [[laptop, 40]]),
            receive(raviAgent, id, [[laptop, 40]])
        ]);
        const statuses = responses.map((r) => r.status).sort();
        const purchase = await PurchaseOrder.findById(id);

        expect(statuses[0]).toBe(200);
        expect([400, 409]).toContain(statuses[1]);
        expect(purchase.items[0].quantityReceived).toBe(100);
        expect(await stockOf(laptop)).toBe(100);
    });
});

describe("Cancel", () => {
    test("cancelling an ORDERED PO tells the supplier", async () => {
        const id = await poAt("ORDERED");
        const response = await raviAgent.put(`/api/purchases/${id}/cancel`).send({ reason: "Found cheaper" });

        expect(response.body.data.purchase).toMatchObject({ status: "CANCELLED", cancelReason: "Found cheaper" });
        expect(await Notification.countDocuments({ recipient: suresh._id, title: "Purchase order cancelled" })).toBe(1);
    });

    test("cancelling a PARTIALLY_RECEIVED PO keeps what was already received", async () => {
        const id = await poAt("ORDERED");
        await receive(meenaAgent, id, [[laptop, 60]]);

        const response = await raviAgent.put(`/api/purchases/${id}/cancel`).send({ reason: "Supplier out of stock" });

        expect(response.body.data.purchase.status).toBe("CANCELLED");
        expect(response.body.data.purchase.items[0].quantityReceived).toBe(60);
        expect(await stockOf(laptop)).toBe(60);
    });

    test("a RECEIVED PO cannot be cancelled", async () => {
        const id = await poAt("ORDERED");
        await receive(meenaAgent, id, [[laptop, 100], [keyboard, 50]]);

        expect((await raviAgent.put(`/api/purchases/${id}/cancel`).send({})).status).toBe(409);
    });
});

describe("History, audit and pending checks", () => {
    test("list filters by status and PO number", async () => {
        await poAt("PENDING");
        await poAt("ORDERED");

        expect((await raviAgent.get("/api/purchases?status=ORDERED")).body.data.purchases).toHaveLength(1);
        expect((await raviAgent.get("/api/purchases?search=000001")).body.data.purchases[0].status).toBe("PENDING");
    });

    test("every step is audited in order", async () => {
        const id = await poAt("ORDERED");
        await sureshAgent.put(`/api/purchases/${id}/confirm`).send({});
        await receive(meenaAgent, id, [[laptop, 100], [keyboard, 50]]);

        const actions = (await AuditLog.find({ entityType: "PurchaseOrder" }).sort({ createdAt: 1 })).map((a) => a.action);
        expect(actions).toEqual([
            "PURCHASE_CREATED", "PURCHASE_SUBMITTED", "PURCHASE_APPROVED", "PURCHASE_ORDERED",
            "PURCHASE_CONFIRMED_BY_SUPPLIER", "PURCHASE_RECEIVED"
        ]);
    });

    test("warehouse with an open PO cannot be deactivated", async () => {
        const id = await poAt("APPROVED");

        const blocked = await adminAgent.delete(`/api/warehouses/${delhi._id}`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.error).toBe("WAREHOUSE_HAS_OPEN_PURCHASES");

        await raviAgent.put(`/api/purchases/${id}/cancel`).send({});
        expect((await adminAgent.delete(`/api/warehouses/${delhi._id}`)).status).toBe(200);
    });

    test("supplier with an open PO cannot be deactivated (DELETE or PUT)", async () => {
        await poAt("DRAFT");

        const byDelete = await raviAgent.delete(`/api/suppliers/${acme._id}`);
        const byPut = await raviAgent.put(`/api/suppliers/${acme._id}`).send({ status: RECORD_STATUS.INACTIVE });

        expect(byDelete.status).toBe(409);
        expect(byDelete.body.error).toBe("SUPPLIER_HAS_OPEN_PURCHASES");
        expect(byPut.status).toBe(409);
    });
});

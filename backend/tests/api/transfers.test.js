const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Inventory = require("../../src/models/Inventory");
const StockTransfer = require("../../src/models/StockTransfer");
const StockTransaction = require("../../src/models/StockTransaction");
const Notification = require("../../src/models/Notification");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let ravi;
let meena;
let raviAgent;
let meenaAgent;
let adminAgent;
let staffAgent;
let laptop;
let delhi;
let noida;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init(), StockTransfer.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com", name: "Admin" });
    ravi = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "ravi@shop.com", name: "Ravi" });
    meena = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "meena@shop.com", name: "Meena" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    raviAgent = await loginAgent("ravi@shop.com");
    meenaAgent = await loginAgent("meena@shop.com");
    staffAgent = await loginAgent("staff@shop.com");

    const category = await Category.create({ name: "Electronics" });
    laptop = await Product.create({
        name: "Dell Laptop", sku: "LAP-001", category: category._id, costPrice: 42000, sellingPrice: 49999, reorderLevel: 5
    });
    delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000 });
    noida = await Warehouse.create({ name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 1000, manager: meena._id });

    // Spec example: Delhi has 100 laptops, Noida has 50
    await Inventory.create({ product: laptop._id, warehouse: delhi._id, quantity: 100, reorderLevel: 5 });
    await Inventory.create({ product: laptop._id, warehouse: noida._id, quantity: 50, reorderLevel: 5 });
});

afterAll(async () => {
    await closeTestDB();
});

const quantityIn = async (warehouse) => (await Inventory.findOne({ product: laptop._id, warehouse: warehouse._id })).quantity;

const requestTransfer = (agent, quantity = 30, overrides = {}) =>
    agent.post("/api/transfers").send({
        product: laptop._id.toString(),
        fromWarehouse: delhi._id.toString(),
        toWarehouse: noida._id.toString(),
        quantity,
        ...overrides
    });

// Walks a new transfer up to the given status
const transferAt = async (status, quantity = 30) => {
    const created = await requestTransfer(raviAgent, quantity);
    const id = created.body.data.transfer._id;
    if (["APPROVED", "DISPATCHED", "RECEIVED"].includes(status)) await meenaAgent.put(`/api/transfers/${id}/approve`);
    if (["DISPATCHED", "RECEIVED"].includes(status)) await raviAgent.put(`/api/transfers/${id}/dispatch`);
    if (status === "RECEIVED") await meenaAgent.put(`/api/transfers/${id}/receive`);
    return id;
};

describe("Access control", () => {
    test("STAFF cannot view or create transfers", async () => {
        expect((await staffAgent.get("/api/transfers")).status).toBe(403);
        expect((await requestTransfer(staffAgent)).status).toBe(403);
    });

    test("not logged in → 401", async () => {
        expect((await request(app).get("/api/transfers")).status).toBe(401);
    });
});

describe("POST /api/transfers (request)", () => {
    test("creates a REQUESTED transfer with a sequential number; no stock moves", async () => {
        const first = await requestTransfer(raviAgent, 30);
        const second = await requestTransfer(raviAgent, 5);

        expect(first.status).toBe(201);
        expect(first.body.data.transfer).toMatchObject({
            transferNumber: "TRF-000001",
            status: "REQUESTED",
            quantity: 30,
            fromWarehouse: { code: "DEL-01" },
            toWarehouse: { code: "NOI-01" },
            requestedBy: { name: "Ravi" }
        });
        expect(second.body.data.transfer.transferNumber).toBe("TRF-000002");
        expect(await quantityIn(delhi)).toBe(100);
    });

    test("notifies other managers and admins, but not the requester", async () => {
        await requestTransfer(raviAgent);
        const notifications = await Notification.find({ type: "STOCK_TRANSFER" }).populate("recipient", "name");

        expect(notifications.map((n) => n.recipient.name).sort()).toEqual(["Admin", "Meena"]);
        expect(notifications[0].message).toBe("TRF-000001: 30 × Dell Laptop from DEL-01 to NOI-01 needs approval.");
    });

    test("same source and destination → 422", async () => {
        const response = await requestTransfer(raviAgent, 30, { toWarehouse: delhi._id.toString() });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Source and destination warehouse cannot be the same");
    });

    test("more than the source has → 400 INSUFFICIENT_STOCK", async () => {
        const response = await requestTransfer(raviAgent, 101);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Insufficient stock of LAP-001 in DEL-01: 100 available, 101 requested");
    });

    test("reserved units cannot be transferred", async () => {
        await Inventory.updateOne({ product: laptop._id, warehouse: delhi._id }, { reservedQuantity: 80 });

        expect((await requestTransfer(raviAgent, 21)).status).toBe(400);
        expect((await requestTransfer(raviAgent, 20)).status).toBe(201);
    });

    test("inactive destination warehouse → 422", async () => {
        await Warehouse.updateOne({ _id: noida._id }, { status: RECORD_STATUS.INACTIVE });

        expect((await requestTransfer(raviAgent)).body.error).toBe("WAREHOUSE_INACTIVE");
    });

    test("negative or zero quantity → 422", async () => {
        expect((await requestTransfer(raviAgent, -5)).status).toBe(422);
        expect((await requestTransfer(raviAgent, 0)).status).toBe(422);
    });
});

describe("Approve / reject", () => {
    test("requester cannot approve their own transfer", async () => {
        const id = await transferAt("REQUESTED");
        const response = await raviAgent.put(`/api/transfers/${id}/approve`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("SELF_APPROVAL_NOT_ALLOWED");
    });

    test("another manager approves; requester is notified; still no stock moves", async () => {
        const id = await transferAt("REQUESTED");
        const response = await meenaAgent.put(`/api/transfers/${id}/approve`);
        const toRavi = await Notification.findOne({ recipient: ravi._id });

        expect(response.status).toBe(200);
        expect(response.body.data.transfer).toMatchObject({ status: "APPROVED", approvedBy: { name: "Meena" } });
        expect(toRavi.message).toBe("TRF-000001 was approved by Meena and can be dispatched.");
        expect(await quantityIn(delhi)).toBe(100);
    });

    test("approval re-checks stock (it may have been used since the request)", async () => {
        const id = await transferAt("REQUESTED", 30);
        await Inventory.updateOne({ product: laptop._id, warehouse: delhi._id }, { quantity: 10 });

        const response = await meenaAgent.put(`/api/transfers/${id}/approve`);
        expect(response.status).toBe(400);
        expect((await StockTransfer.findById(id)).status).toBe("REQUESTED");
    });

    test("reject needs a reason, then cannot be approved or dispatched", async () => {
        const id = await transferAt("REQUESTED");

        expect((await meenaAgent.put(`/api/transfers/${id}/reject`).send({})).status).toBe(422);

        const rejected = await meenaAgent.put(`/api/transfers/${id}/reject`).send({ reason: "Noida is being renovated" });
        expect(rejected.body.data.transfer).toMatchObject({
            status: "REJECTED", rejectionReason: "Noida is being renovated", rejectedBy: { name: "Meena" }
        });

        const approveAfter = await adminAgent.put(`/api/transfers/${id}/approve`);
        expect(approveAfter.status).toBe(409);
        expect(approveAfter.body.message).toBe("Transfer TRF-000001 is REJECTED; it must be REQUESTED to do this");
    });
});

describe("Dispatch (source −X) and receive (destination +X) — Rule 6", () => {
    test("full spec example: Delhi 100 → send 30 → Delhi 70, Noida 50 + 30 = 80", async () => {
        const id = await transferAt("APPROVED");

        const dispatched = await raviAgent.put(`/api/transfers/${id}/dispatch`);
        expect(dispatched.body.data.transfer.status).toBe("DISPATCHED");
        expect(await quantityIn(delhi)).toBe(70);
        expect(await quantityIn(noida)).toBe(50); // in transit: in neither warehouse

        const received = await meenaAgent.put(`/api/transfers/${id}/receive`);
        expect(received.body.data.transfer).toMatchObject({ status: "RECEIVED", receivedBy: { name: "Meena" } });
        expect(await quantityIn(delhi)).toBe(70);
        expect(await quantityIn(noida)).toBe(80);
    });

    test("creates TRANSFER_OUT and TRANSFER_IN transactions linked to the transfer (Rule 9)", async () => {
        const id = await transferAt("RECEIVED");
        const transactions = await StockTransaction.find({ referenceId: id }).sort({ createdAt: 1 });

        expect(transactions.map((t) => [t.type, t.quantityBefore, t.quantityAfter])).toEqual([
            ["TRANSFER_OUT", 100, 70],
            ["TRANSFER_IN", 50, 80]
        ]);
        expect(transactions.every((t) => t.referenceType === "TRANSFER")).toBe(true);
    });

    test("every step is audited", async () => {
        await transferAt("RECEIVED");
        const actions = (await AuditLog.find({ entityType: "StockTransfer" }).sort({ createdAt: 1 })).map((a) => a.action);

        expect(actions).toEqual(["TRANSFER_REQUESTED", "TRANSFER_APPROVED", "TRANSFER_DISPATCHED", "TRANSFER_RECEIVED"]);
    });

    test("destination manager is told when goods are dispatched", async () => {
        await transferAt("DISPATCHED");
        const toMeena = await Notification.findOne({ recipient: meena._id, title: "Goods on the way" });

        expect(toMeena.message).toBe("TRF-000001: 30 unit(s) dispatched to NOI-01. Confirm when received.");
    });

    test("cannot dispatch before approval, cannot receive before dispatch", async () => {
        const id = await transferAt("REQUESTED");

        expect((await raviAgent.put(`/api/transfers/${id}/dispatch`)).status).toBe(409);
        expect((await raviAgent.put(`/api/transfers/${id}/receive`)).status).toBe(409);
    });

    test("stock ran out after approval → dispatch fails and transfer stays APPROVED", async () => {
        const id = await transferAt("APPROVED", 30);
        await Inventory.updateOne({ product: laptop._id, warehouse: delhi._id }, { quantity: 20 });

        const response = await raviAgent.put(`/api/transfers/${id}/dispatch`);
        const transfer = await StockTransfer.findById(id);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("INSUFFICIENT_STOCK");
        expect(transfer.status).toBe("APPROVED");
        expect(transfer.dispatchedBy).toBeUndefined();
        expect(await quantityIn(delhi)).toBe(20);
    });

    test("RACE: two dispatch clicks at the same moment remove stock only once", async () => {
        const id = await transferAt("APPROVED", 30);

        const responses = await Promise.all([
            raviAgent.put(`/api/transfers/${id}/dispatch`),
            meenaAgent.put(`/api/transfers/${id}/dispatch`)
        ]);

        expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await quantityIn(delhi)).toBe(70);
        expect(await StockTransaction.countDocuments({ type: "TRANSFER_OUT" })).toBe(1);
    });

    test("RACE: two receive clicks add stock only once", async () => {
        const id = await transferAt("DISPATCHED", 30);

        await Promise.all([
            raviAgent.put(`/api/transfers/${id}/receive`),
            meenaAgent.put(`/api/transfers/${id}/receive`)
        ]);

        expect(await quantityIn(noida)).toBe(80);
    });

    test("destination full → receive fails, stays DISPATCHED; works after capacity is raised", async () => {
        const id = await transferAt("DISPATCHED", 30);
        await Warehouse.updateOne({ _id: noida._id }, { capacity: 60 });

        const blocked = await meenaAgent.put(`/api/transfers/${id}/receive`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.error).toBe("CAPACITY_EXCEEDED");
        expect((await StockTransfer.findById(id)).status).toBe("DISPATCHED");

        await Warehouse.updateOne({ _id: noida._id }, { capacity: 1000 });
        expect((await meenaAgent.put(`/api/transfers/${id}/receive`)).status).toBe(200);
        expect(await quantityIn(noida)).toBe(80);
    });

    test("goods in transit can be received even if the product was deactivated", async () => {
        const id = await transferAt("DISPATCHED", 30);
        await Product.updateOne({ _id: laptop._id }, { status: RECORD_STATUS.INACTIVE });

        expect((await meenaAgent.put(`/api/transfers/${id}/receive`)).status).toBe(200);
    });

    test("receiving into a warehouse with no row yet creates the row", async () => {
        const mumbai = await Warehouse.create({ name: "Mumbai", code: "MUM-01", city: "Mumbai", capacity: 1000 });
        const created = await requestTransfer(raviAgent, 10, { toWarehouse: mumbai._id.toString() });
        const id = created.body.data.transfer._id;
        await meenaAgent.put(`/api/transfers/${id}/approve`);
        await raviAgent.put(`/api/transfers/${id}/dispatch`);
        await meenaAgent.put(`/api/transfers/${id}/receive`);

        expect(await quantityIn(mumbai)).toBe(10);
    });
});

describe("Cancel", () => {
    test("can cancel from REQUESTED or APPROVED; requester notified when someone else cancels", async () => {
        const requested = await transferAt("REQUESTED");
        const approved = await transferAt("APPROVED");

        expect((await raviAgent.put(`/api/transfers/${requested}/cancel`).send({})).body.data.transfer.status).toBe("CANCELLED");
        const byMeena = await meenaAgent.put(`/api/transfers/${approved}/cancel`).send({ reason: "Not needed any more" });

        expect(byMeena.body.data.transfer).toMatchObject({ status: "CANCELLED", cancelReason: "Not needed any more" });
        expect(await Notification.countDocuments({ recipient: ravi._id, title: "Transfer cancelled" })).toBe(1);
        expect(await quantityIn(delhi)).toBe(100);
    });

    test("cannot cancel after dispatch (the goods have already left)", async () => {
        const id = await transferAt("DISPATCHED");
        const response = await raviAgent.put(`/api/transfers/${id}/cancel`).send({});

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Transfer TRF-000001 is DISPATCHED; it must be REQUESTED or APPROVED to do this");
    });
});

describe("Lists and history", () => {
    test("filter by status, by either warehouse, and search by number", async () => {
        await transferAt("RECEIVED", 10);
        await transferAt("REQUESTED", 5);

        const received = await raviAgent.get("/api/transfers?status=RECEIVED");
        const noidaSide = await raviAgent.get(`/api/transfers?warehouse=${noida._id}`);
        const byNumber = await raviAgent.get("/api/transfers?search=000002");

        expect(received.body.data.transfers).toHaveLength(1);
        expect(noidaSide.body.data.pagination.total).toBe(2);
        expect(byNumber.body.data.transfers[0].quantity).toBe(5);
    });

    test("GET /:id shows who did each step; unknown id → 404", async () => {
        const id = await transferAt("RECEIVED");
        const response = await adminAgent.get(`/api/transfers/${id}`);

        expect(response.body.data.transfer).toMatchObject({
            requestedBy: { name: "Ravi" },
            approvedBy: { name: "Meena" },
            dispatchedBy: { name: "Ravi" },
            receivedBy: { name: "Meena" }
        });
        expect((await adminAgent.get("/api/transfers/000000000000000000000000")).body.error).toBe("TRANSFER_NOT_FOUND");
    });
});

describe("Warehouse deactivation is blocked by open transfers (Step 7 pending check)", () => {
    test("empty destination with an open transfer cannot be deactivated", async () => {
        const mumbai = await Warehouse.create({ name: "Mumbai", code: "MUM-01", city: "Mumbai", capacity: 1000 });
        const created = await requestTransfer(raviAgent, 10, { toWarehouse: mumbai._id.toString() });

        const blocked = await adminAgent.delete(`/api/warehouses/${mumbai._id}`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.error).toBe("WAREHOUSE_HAS_OPEN_TRANSFERS");

        await raviAgent.put(`/api/transfers/${created.body.data.transfer._id}/cancel`).send({});
        expect((await adminAgent.delete(`/api/warehouses/${mumbai._id}`)).status).toBe(200);
    });
});

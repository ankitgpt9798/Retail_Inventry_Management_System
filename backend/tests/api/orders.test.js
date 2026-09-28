const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Inventory = require("../../src/models/Inventory");
const Order = require("../../src/models/Order");
const OrderItem = require("../../src/models/OrderItem");
const Notification = require("../../src/models/Notification");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, RECORD_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let sunita;
let sunitaAgent;
let arjunAgent;
let adminAgent;
let managerAgent;
let supplierAgent;
let laptop;
let mouse;
let delhi;
let noida;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init(), Order.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com", name: "Admin" });
    sunita = await createTestUser({ role: ROLES.STAFF, email: "sunita@shop.com", name: "Sunita" });
    await createTestUser({ role: ROLES.STAFF, email: "arjun@shop.com", name: "Arjun" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com", name: "Manager" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    adminAgent = await loginAgent("admin@shop.com");
    sunitaAgent = await loginAgent("sunita@shop.com");
    arjunAgent = await loginAgent("arjun@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");

    const category = await Category.create({ name: "Electronics" });
    laptop = await Product.create({
        name: "Dell Laptop", sku: "LAP-001", category: category._id, costPrice: 42000, sellingPrice: 49999, taxRate: 18
    });
    mouse = await Product.create({
        name: "Wireless Mouse", sku: "MOU-M185", category: category._id, costPrice: 450, sellingPrice: 699, taxRate: 18
    });
    delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000 });
    noida = await Warehouse.create({ name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 1000 });

    await Inventory.create({ product: laptop._id, warehouse: delhi._id, quantity: 70, reorderLevel: 5 });
    await Inventory.create({ product: mouse._id, warehouse: delhi._id, quantity: 80, reorderLevel: 15 });
});

afterAll(async () => {
    await closeTestDB();
});

const orderBody = (overrides = {}) => ({
    customer: { name: "Priya Sharma", phone: "+91 98100 12345", address: "12 MG Road, Delhi" },
    warehouse: delhi._id.toString(),
    items: [
        { product: laptop._id.toString(), quantity: 2 },
        { product: mouse._id.toString(), quantity: 3 }
    ],
    ...overrides
});

const createOrder = async (agent = sunitaAgent, overrides) => {
    const response = await agent.post("/api/orders").send(orderBody(overrides));
    return response.body.data.order._id;
};

const stock = async (product, warehouse = delhi) => {
    const inventory = await Inventory.findOne({ product: product._id, warehouse: warehouse._id });
    return { quantity: inventory.quantity, reserved: inventory.reservedQuantity, available: inventory.availableQuantity };
};

describe("Access control", () => {
    test("INVENTORY_MANAGER can view but not create orders", async () => {
        expect((await managerAgent.get("/api/orders")).status).toBe(200);
        expect((await managerAgent.post("/api/orders").send(orderBody())).status).toBe(403);
    });

    test("SUPPLIER cannot see orders; not logged in → 401", async () => {
        expect((await supplierAgent.get("/api/orders")).status).toBe(403);
        expect((await request(app).get("/api/orders")).status).toBe(401);
    });
});

describe("POST /api/orders (create, check stock)", () => {
    test("creates a PENDING order with prices and totals calculated by the server", async () => {
        const response = await sunitaAgent.post("/api/orders").send(orderBody());
        const { order, items } = response.body.data;

        expect(response.status).toBe(201);
        expect(order).toMatchObject({
            orderNumber: "ORD-000001",
            status: "PENDING",
            subtotal: 102095,
            taxAmount: 18377.1,
            totalAmount: 120472.1,
            customer: { name: "Priya Sharma" },
            warehouse: { code: "DEL-01" },
            createdBy: { name: "Sunita" }
        });
        expect(items.map((i) => [i.sku, i.quantity, i.unitPrice, i.lineTotal])).toEqual([
            ["LAP-001", 2, 49999, 117997.64],
            ["MOU-M185", 3, 699, 2474.46]
        ]);
        expect(order.statusHistory).toHaveLength(1);
    });

    test("creating does NOT reserve stock yet", async () => {
        await createOrder();

        expect(await stock(laptop)).toEqual({ quantity: 70, reserved: 0, available: 70 });
    });

    test("prices sent by the client are ignored", async () => {
        const response = await sunitaAgent.post("/api/orders").send(orderBody({
            items: [{ product: laptop._id.toString(), quantity: 1, unitPrice: 1 }],
            totalAmount: 1
        }));

        expect(response.body.data.items[0].unitPrice).toBe(49999);
        expect(response.body.data.order.subtotal).toBe(49999);
    });

    test("price snapshot: changing the product price later doesn't change the order", async () => {
        const id = await createOrder();
        await Product.updateOne({ _id: laptop._id }, { sellingPrice: 59999 });

        const response = await sunitaAgent.get(`/api/orders/${id}`);
        expect(response.body.data.items[0].unitPrice).toBe(49999);
    });

    test("Rule 2 (early check): more than available → 400", async () => {
        const response = await sunitaAgent.post("/api/orders").send(orderBody({
            items: [{ product: laptop._id.toString(), quantity: 71 }]
        }));

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Insufficient stock of LAP-001 in DEL-01: 70 available, 71 requested");
    });

    test("product never stocked in that warehouse → 0 available", async () => {
        const response = await sunitaAgent.post("/api/orders").send(orderBody({ warehouse: noida._id.toString() }));

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("0 available");
    });

    test.each([
        ["missing customer", { customer: undefined }, "Customer details are required"],
        ["no items", { items: [] }, "Order must contain at least one item"],
        ["bad phone", { customer: { name: "Priya", phone: "abc" } }, "Phone must be 7-20 characters: digits, spaces, +, - or brackets"]
    ])("%s → 422", async (label, override, expectedMessage) => {
        const response = await sunitaAgent.post("/api/orders").send(orderBody(override));

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });

    test("same product twice or zero quantity → 422", async () => {
        const twice = await sunitaAgent.post("/api/orders").send(orderBody({
            items: [{ product: laptop._id.toString(), quantity: 1 }, { product: laptop._id.toString(), quantity: 1 }]
        }));
        const zero = await sunitaAgent.post("/api/orders").send(orderBody({
            items: [{ product: laptop._id.toString(), quantity: 0 }]
        }));

        expect(twice.status).toBe(422);
        expect(zero.status).toBe(422);
    });

    test("inactive product or warehouse → 422", async () => {
        await Product.updateOne({ _id: mouse._id }, { status: RECORD_STATUS.INACTIVE });
        expect((await sunitaAgent.post("/api/orders").send(orderBody())).body.error).toBe("PRODUCT_INACTIVE");

        await Warehouse.updateOne({ _id: delhi._id }, { status: RECORD_STATUS.INACTIVE });
        expect((await sunitaAgent.post("/api/orders").send(orderBody())).body.error).toBe("WAREHOUSE_INACTIVE");
    });
});

describe("PUT /api/orders/:id/confirm (reserve stock, Rule 4)", () => {
    test("reserves every line; quantity stays, available drops", async () => {
        const id = await createOrder();
        const response = await sunitaAgent.put(`/api/orders/${id}/confirm`);

        expect(response.status).toBe(200);
        expect(response.body.data.order.status).toBe("CONFIRMED");
        expect(await stock(laptop)).toEqual({ quantity: 70, reserved: 2, available: 68 });
        expect(await stock(mouse)).toEqual({ quantity: 80, reserved: 3, available: 77 });
    });

    test("status history records who confirmed", async () => {
        const id = await createOrder();
        const response = await arjunAgent.put(`/api/orders/${id}/confirm`);
        const history = response.body.data.order.statusHistory;

        expect(history.map((h) => [h.status, h.changedBy.name])).toEqual([["PENDING", "Sunita"], ["CONFIRMED", "Arjun"]]);
    });

    test("confirm: true on create reserves immediately", async () => {
        const response = await sunitaAgent.post("/api/orders").send(orderBody({ confirm: true }));

        expect(response.body.data.order.status).toBe("CONFIRMED");
        expect((await stock(laptop)).reserved).toBe(2);
    });

    test("NEW_ORDER goes to admins and other staff (not the person who confirmed, not managers)", async () => {
        const id = await createOrder();
        await sunitaAgent.put(`/api/orders/${id}/confirm`);
        const notified = await Notification.find({ type: "NEW_ORDER" }).populate("recipient", "name");

        expect(notified.map((n) => n.recipient.name).sort()).toEqual(["Admin", "Arjun"]);
    });

    test("ALL OR NOTHING: if the second line can't be reserved, the first is released", async () => {
        const id = await createOrder();
        // Someone used up the mice after the order was created
        await Inventory.updateOne({ product: mouse._id }, { quantity: 1 });

        const response = await sunitaAgent.put(`/api/orders/${id}/confirm`);
        const order = await Order.findById(id);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Insufficient stock of MOU-M185 in DEL-01: 1 available, 3 requested");
        expect((await stock(laptop)).reserved).toBe(0);
        expect(order.status).toBe("PENDING");
        expect(order.statusHistory).toHaveLength(1);
    });

    test("RACE: double-clicking confirm reserves only once", async () => {
        const id = await createOrder();

        const responses = await Promise.all([
            sunitaAgent.put(`/api/orders/${id}/confirm`),
            sunitaAgent.put(`/api/orders/${id}/confirm`)
        ]);

        expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
        expect((await stock(laptop)).reserved).toBe(2);
    });

    test("RACE: two orders for the last 5 laptops → exactly one gets them (Rule 2)", async () => {
        await Inventory.updateOne({ product: laptop._id }, { quantity: 5 });
        const onlyLaptops = { items: [{ product: laptop._id.toString(), quantity: 5 }] };
        const first = await createOrder(sunitaAgent, onlyLaptops);
        const second = await createOrder(arjunAgent, onlyLaptops);

        const responses = await Promise.all([
            sunitaAgent.put(`/api/orders/${first}/confirm`),
            arjunAgent.put(`/api/orders/${second}/confirm`)
        ]);

        expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
        expect(await stock(laptop)).toEqual({ quantity: 5, reserved: 5, available: 0 });
    });

    test("reserved units can't be removed or transferred by anyone else", async () => {
        const id = await createOrder(sunitaAgent, { items: [{ product: laptop._id.toString(), quantity: 60 }] });
        await sunitaAgent.put(`/api/orders/${id}/confirm`);

        const stockOut = await managerAgent.post("/api/inventory/stock-out").send({
            product: laptop._id.toString(), warehouse: delhi._id.toString(), quantity: 11, note: "Damaged"
        });
        const transfer = await managerAgent.post("/api/transfers").send({
            product: laptop._id.toString(), fromWarehouse: delhi._id.toString(), toWarehouse: noida._id.toString(), quantity: 11
        });

        expect(stockOut.body.message).toContain("10 available");
        expect(transfer.status).toBe(400);
    });

    test("Rule 7: a reservation that drops available below the reorder level raises LOW_STOCK", async () => {
        const id = await createOrder(sunitaAgent, { items: [{ product: laptop._id.toString(), quantity: 66 }] });
        await sunitaAgent.put(`/api/orders/${id}/confirm`);

        const alert = await Notification.findOne({ type: "LOW_STOCK" });
        expect(alert.message).toBe("Dell Laptop (LAP-001) is below reorder level in DEL-01: 4 available, reorder level 5.");
    });
});

describe("PUT /api/orders/:id (edit while PENDING)", () => {
    test("replacing items recalculates totals and replaces the lines", async () => {
        const id = await createOrder();
        const response = await sunitaAgent.put(`/api/orders/${id}`).send({
            items: [{ product: mouse._id.toString(), quantity: 10 }]
        });

        expect(response.body.data.order.subtotal).toBe(6990);
        expect(response.body.data.items.map((i) => i.sku)).toEqual(["MOU-M185"]);
        expect(await OrderItem.countDocuments({ order: id })).toBe(1);
    });

    test("changing the warehouse re-checks stock there", async () => {
        const id = await createOrder();
        const response = await sunitaAgent.put(`/api/orders/${id}`).send({ warehouse: noida._id.toString() });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("INSUFFICIENT_STOCK");
    });

    test("customer details can be corrected", async () => {
        const id = await createOrder();
        const response = await sunitaAgent.put(`/api/orders/${id}`).send({
            customer: { name: "Priya S. Sharma", phone: "9810012345" }
        });

        expect(response.body.data.order.customer.name).toBe("Priya S. Sharma");
    });

    test("a CONFIRMED order cannot be edited", async () => {
        const id = await createOrder();
        await sunitaAgent.put(`/api/orders/${id}/confirm`);

        const response = await sunitaAgent.put(`/api/orders/${id}`).send({ notes: "gift wrap" });
        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Order ORD-000001 is CONFIRMED; only PENDING orders can be edited");
    });
});

describe("DELETE /api/orders/:id (cancel, release stock)", () => {
    test("cancelling a PENDING order: nothing to release", async () => {
        const id = await createOrder();
        const response = await sunitaAgent.delete(`/api/orders/${id}`).send({ reason: "Customer changed mind" });

        expect(response.body.data.order).toMatchObject({ status: "CANCELLED", cancelReason: "Customer changed mind" });
        expect((await stock(laptop)).reserved).toBe(0);
        expect(await Order.countDocuments()).toBe(1);
    });

    test("cancelling a CONFIRMED order releases the reservation", async () => {
        const id = await createOrder();
        await sunitaAgent.put(`/api/orders/${id}/confirm`);

        await sunitaAgent.delete(`/api/orders/${id}`).send({});

        expect(await stock(laptop)).toEqual({ quantity: 70, reserved: 0, available: 70 });
        expect(await stock(mouse)).toEqual({ quantity: 80, reserved: 0, available: 80 });
    });

    test("creator is told when someone else cancels", async () => {
        const id = await createOrder(sunitaAgent);
        await arjunAgent.delete(`/api/orders/${id}`).send({ reason: "Duplicate order" });

        const toSunita = await Notification.findOne({ recipient: sunita._id, type: "ORDER_STATUS_CHANGED" });
        expect(toSunita.message).toBe("ORD-000001 was cancelled by Arjun: Duplicate order");
    });

    test("cannot cancel twice (and stock is released only once)", async () => {
        const id = await createOrder();
        await sunitaAgent.put(`/api/orders/${id}/confirm`);
        await sunitaAgent.delete(`/api/orders/${id}`).send({});

        const again = await sunitaAgent.delete(`/api/orders/${id}`).send({});
        expect(again.status).toBe(409);
        expect((await stock(laptop)).reserved).toBe(0);
    });

    test("every step is audited", async () => {
        const id = await createOrder();
        await sunitaAgent.put(`/api/orders/${id}/confirm`);
        await sunitaAgent.delete(`/api/orders/${id}`).send({});

        const actions = (await AuditLog.find({ entityType: "Order" }).sort({ createdAt: 1 })).map((a) => a.action);
        expect(actions).toEqual(["ORDER_CREATED", "ORDER_CONFIRMED", "ORDER_CANCELLED"]);
    });
});

describe("Lists and the warehouse pending check", () => {
    test("search by customer name, phone or order number; filter by status", async () => {
        await createOrder();
        await createOrder(sunitaAgent, { customer: { name: "Rahul Verma", phone: "9999900000" } });
        const second = await Order.findOne({ "customer.name": "Rahul Verma" });
        await sunitaAgent.put(`/api/orders/${second._id}/confirm`);

        const names = async (url) => (await sunitaAgent.get(url)).body.data.orders.map((o) => o.customer.name);

        expect(await names("/api/orders?search=priya")).toEqual(["Priya Sharma"]);
        expect(await names("/api/orders?search=99999")).toEqual(["Rahul Verma"]);
        expect(await names("/api/orders?search=ORD-000002")).toEqual(["Rahul Verma"]);
        expect(await names("/api/orders?status=CONFIRMED")).toEqual(["Rahul Verma"]);
    });

    test("unknown order → 404", async () => {
        const response = await sunitaAgent.get("/api/orders/000000000000000000000000");

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("ORDER_NOT_FOUND");
    });

    test("a warehouse with an open order cannot be deactivated", async () => {
        const id = await createOrder();
        // Empty the warehouse so only the open order stands in the way
        await Inventory.updateMany({ warehouse: delhi._id }, { quantity: 0 });

        const blocked = await adminAgent.delete(`/api/warehouses/${delhi._id}`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.error).toBe("WAREHOUSE_HAS_OPEN_ORDERS");

        await sunitaAgent.delete(`/api/orders/${id}`).send({});
        expect((await adminAgent.delete(`/api/warehouses/${delhi._id}`)).status).toBe(200);
    });
});

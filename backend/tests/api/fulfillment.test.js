const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Inventory = require("../../src/models/Inventory");
const Order = require("../../src/models/Order");
const StockTransaction = require("../../src/models/StockTransaction");
const Notification = require("../../src/models/Notification");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let sunita;
let sunitaAgent;
let arjunAgent;
let managerAgent;
let laptop;
let mouse;
let delhi;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init(), Order.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    sunita = await createTestUser({ role: ROLES.STAFF, email: "sunita@shop.com", name: "Sunita" });
    await createTestUser({ role: ROLES.STAFF, email: "arjun@shop.com", name: "Arjun" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com" });
    sunitaAgent = await loginAgent("sunita@shop.com");
    arjunAgent = await loginAgent("arjun@shop.com");
    managerAgent = await loginAgent("manager@shop.com");

    const category = await Category.create({ name: "Electronics" });
    laptop = await Product.create({ name: "Dell Laptop", sku: "LAP-001", category: category._id, costPrice: 1, sellingPrice: 49999, taxRate: 18 });
    mouse = await Product.create({ name: "Mouse", sku: "MOU-M185", category: category._id, costPrice: 1, sellingPrice: 699, taxRate: 18 });
    delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000 });
    await Inventory.create({ product: laptop._id, warehouse: delhi._id, quantity: 70, reorderLevel: 5 });
    await Inventory.create({ product: mouse._id, warehouse: delhi._id, quantity: 80, reorderLevel: 15 });
});

afterAll(async () => {
    await closeTestDB();
});

// Creates and confirms an order (2 laptops + 3 mice) by Sunita
const confirmedOrder = async () => {
    const response = await sunitaAgent.post("/api/orders").send({
        customer: { name: "Priya Sharma", address: "12 MG Road" },
        warehouse: delhi._id.toString(),
        items: [
            { product: laptop._id.toString(), quantity: 2 },
            { product: mouse._id.toString(), quantity: 3 }
        ],
        confirm: true
    });
    return response.body.data.order._id;
};

const setStatus = (agent, id, status, extra = {}) =>
    agent.put(`/api/orders/${id}/status`).send({ status, ...extra });

const SHIPPING = { carrier: "Delhivery", trackingNumber: "DLV123456789" };

// Walks a confirmed order forward to the given status
const orderAt = async (status) => {
    const id = await confirmedOrder();
    const steps = ["PROCESSING", "PACKED", "SHIPPED", "DELIVERED"];
    for (const step of steps.slice(0, steps.indexOf(status) + 1)) {
        await setStatus(sunitaAgent, id, step, step === "SHIPPED" ? SHIPPING : {});
    }
    return id;
};

const stock = async (product) => {
    const inventory = await Inventory.findOne({ product: product._id, warehouse: delhi._id });
    return { quantity: inventory.quantity, reserved: inventory.reservedQuantity, available: inventory.availableQuantity };
};

describe("The fulfillment journey", () => {
    test("CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED with a full timeline", async () => {
        const id = await confirmedOrder();

        for (const [status, extra] of [["PROCESSING", { note: "Picking" }], ["PACKED", {}], ["SHIPPED", SHIPPING], ["DELIVERED", {}]]) {
            const response = await setStatus(sunitaAgent, id, status, extra);
            expect(response.status).toBe(200);
            expect(response.body.data.order.status).toBe(status);
        }

        const order = await Order.findById(id);
        expect(order.statusHistory.map((h) => h.status)).toEqual(
            ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"]
        );
        expect(order.statusHistory[2].note).toBe("Picking");
        expect(order).toMatchObject({ carrier: "Delhivery", trackingNumber: "DLV123456789" });
    });

    test("stock does not move while PROCESSING or PACKED (goods still in our building)", async () => {
        await orderAt("PACKED");

        expect(await stock(laptop)).toEqual({ quantity: 70, reserved: 2, available: 68 });
    });

    test("Rule 5 at SHIPPED: quantity −= 2 and reserved −= 2; available unchanged", async () => {
        await orderAt("SHIPPED");

        expect(await stock(laptop)).toEqual({ quantity: 68, reserved: 0, available: 68 });
        expect(await stock(mouse)).toEqual({ quantity: 77, reserved: 0, available: 77 });
    });

    test("shipping writes STOCK_OUT transactions linked to the order (Rule 9)", async () => {
        const id = await orderAt("SHIPPED");
        const transactions = await StockTransaction.find({ referenceId: id }).populate("product", "sku");

        expect(transactions.map((t) => [t.product.sku, t.type, t.referenceType, t.quantityBefore, t.quantityAfter]).sort())
            .toEqual([
                ["LAP-001", "STOCK_OUT", "ORDER", 70, 68],
                ["MOU-M185", "STOCK_OUT", "ORDER", 80, 77]
            ]);
    });

    test("delivering changes no stock", async () => {
        await orderAt("DELIVERED");

        expect((await stock(laptop)).quantity).toBe(68);
        expect(await StockTransaction.countDocuments()).toBe(2);
    });

    test("shipping never raises a low-stock alert (available doesn't change)", async () => {
        await orderAt("SHIPPED");

        expect(await Notification.countDocuments({ type: "LOW_STOCK" })).toBe(0);
    });

    test("audit: ORDER_STATUS_UPDATED for normal steps, ORDER_SHIPPED for shipping", async () => {
        await orderAt("DELIVERED");
        const actions = (await AuditLog.find({ entityType: "Order" }).sort({ createdAt: 1 })).map((a) => a.action);

        expect(actions).toEqual([
            "ORDER_CREATED", "ORDER_CONFIRMED", "ORDER_STATUS_UPDATED", "ORDER_STATUS_UPDATED", "ORDER_SHIPPED", "ORDER_STATUS_UPDATED"
        ]);
    });
});

describe("Allowed transitions", () => {
    test("cannot skip steps: CONFIRMED → SHIPPED", async () => {
        const id = await confirmedOrder();
        const response = await setStatus(sunitaAgent, id, "SHIPPED", SHIPPING);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Order ORD-000001 is CONFIRMED; it must be PACKED to mark it SHIPPED");
        expect((await stock(laptop)).quantity).toBe(70);
    });

    test("cannot go backwards: PACKED → PROCESSING", async () => {
        const id = await orderAt("PACKED");

        expect((await setStatus(sunitaAgent, id, "PROCESSING")).status).toBe(409);
    });

    test("a PENDING order must be confirmed first", async () => {
        const response = await sunitaAgent.post("/api/orders").send({
            customer: { name: "Priya" }, warehouse: delhi._id.toString(),
            items: [{ product: laptop._id.toString(), quantity: 1 }]
        });

        const move = await setStatus(sunitaAgent, response.body.data.order._id, "PROCESSING");
        expect(move.status).toBe(409);
    });

    test("PENDING, CONFIRMED and CANCELLED can't be set through this route", async () => {
        const id = await confirmedOrder();

        for (const status of ["PENDING", "CONFIRMED", "CANCELLED"]) {
            const response = await setStatus(sunitaAgent, id, status);
            expect(response.status).toBe(422);
        }
    });

    test("SHIPPED needs carrier and tracking number", async () => {
        const id = await orderAt("PACKED");
        const response = await setStatus(sunitaAgent, id, "SHIPPED");

        expect(response.status).toBe(422);
        expect(response.body.errors.map((e) => e.field)).toEqual(["carrier", "trackingNumber"]);
    });

    test("cancel is still possible when PACKED (reservation released)…", async () => {
        const id = await orderAt("PACKED");
        const response = await sunitaAgent.delete(`/api/orders/${id}`).send({ reason: "Customer cancelled" });

        expect(response.status).toBe(200);
        expect(await stock(laptop)).toEqual({ quantity: 70, reserved: 0, available: 70 });
    });

    test("…but not after SHIPPED", async () => {
        const id = await orderAt("SHIPPED");
        const response = await sunitaAgent.delete(`/api/orders/${id}`).send({});

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Order ORD-000001 is SHIPPED; it can only be cancelled before it is shipped");
    });

    test("INVENTORY_MANAGER cannot update order status", async () => {
        const id = await confirmedOrder();

        expect((await setStatus(managerAgent, id, "PROCESSING")).status).toBe(403);
    });
});

describe("Safety", () => {
    test("RACE: two people click 'Ship' together → shipped once, stock deducted once", async () => {
        const id = await orderAt("PACKED");

        const responses = await Promise.all([
            setStatus(sunitaAgent, id, "SHIPPED", SHIPPING),
            setStatus(arjunAgent, id, "SHIPPED", SHIPPING)
        ]);

        expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await stock(laptop)).toEqual({ quantity: 68, reserved: 0, available: 68 });
        expect(await StockTransaction.countDocuments({ type: "STOCK_OUT" })).toBe(2);
    });

    test("if one line can't ship, shipped lines are put back and the order stays PACKED", async () => {
        const id = await orderAt("PACKED");
        // Simulate a broken reservation (someone edited the database by hand)
        await Inventory.updateOne({ product: mouse._id }, { reservedQuantity: 0 });

        const response = await setStatus(sunitaAgent, id, "SHIPPED", SHIPPING);
        const order = await Order.findById(id);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("RESERVATION_MISMATCH");
        expect(await stock(laptop)).toEqual({ quantity: 70, reserved: 2, available: 68 });
        expect(order.status).toBe("PACKED");
        expect(order.trackingNumber).toBeUndefined();
        expect(order.statusHistory.at(-1).status).toBe("PACKED");

        // History is kept: the STOCK_OUT and the ADJUSTMENT that reversed it
        const types = (await StockTransaction.find({ referenceId: id }).sort({ createdAt: 1 })).map((t) => t.type);
        expect(types).toEqual(["STOCK_OUT", "ADJUSTMENT"]);
    });
});

describe("Notifications and queue", () => {
    test("the order's creator is told when someone else moves it (with tracking on ship)", async () => {
        const id = await orderAt("PACKED");
        await setStatus(arjunAgent, id, "SHIPPED", SHIPPING);

        const toSunita = await Notification.findOne({ recipient: sunita._id, type: "ORDER_STATUS_CHANGED" });
        expect(toSunita.message).toBe("ORD-000001 for Priya Sharma is now SHIPPED via Delhivery, tracking DLV123456789.");
    });

    test("no notification when you move your own order", async () => {
        await orderAt("DELIVERED");

        expect(await Notification.countDocuments({ type: "ORDER_STATUS_CHANGED" })).toBe(0);
    });

    test("fulfillment queue counts orders per stage", async () => {
        await confirmedOrder();
        await orderAt("PROCESSING");
        await orderAt("PACKED");
        await orderAt("DELIVERED");

        const response = await managerAgent.get("/api/orders/fulfillment-queue");

        expect(response.body.data.queue).toEqual({ CONFIRMED: 1, PROCESSING: 1, PACKED: 1, SHIPPED: 0 });
    });
});

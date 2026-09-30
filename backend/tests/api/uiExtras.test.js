// Tests for the API additions made for the card-layout UI redesign:
// order payment status, ?sort= on lists, inventory stock-status/category filters,
// the customers list (built from orders) and the public contact form.
const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Supplier = require("../../src/models/Supplier");
const Inventory = require("../../src/models/Inventory");
const Order = require("../../src/models/Order");
const PurchaseOrder = require("../../src/models/PurchaseOrder");
const StockTransfer = require("../../src/models/StockTransfer");
const AuditLog = require("../../src/models/AuditLog");
const Notification = require("../../src/models/Notification");
const ContactMessage = require("../../src/models/ContactMessage");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let admin;
let staffAgent;
let managerAgent;
let supplierAgent;
let electronics;
let grocery;
let delhi;
let noida;
let products;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init(), Order.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    admin = await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com", name: "Admin" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com", name: "Staff" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com", name: "Manager" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    staffAgent = await loginAgent("staff@shop.com");
    managerAgent = await loginAgent("manager@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");

    electronics = await Category.create({ name: "Electronics" });
    grocery = await Category.create({ name: "Grocery" });
    delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 10000 });
    noida = await Warehouse.create({ name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 10000 });

    const make = (name, sku, category, brand, costPrice) =>
        Product.create({ name, sku, category: category._id, brand, costPrice, sellingPrice: costPrice * 2, reorderLevel: 10 });
    products = {
        laptop: await make("Dell Laptop", "LAP-001", electronics, "Dell", 40000),
        mouse: await make("Wireless Mouse", "MOU-001", electronics, "Logitech", 500),
        rice: await make("Basmati Rice", "RICE-5KG", grocery, "India Gate", 450),
        oil: await make("Sunflower Oil", "OIL-1L", grocery, "Fortune", 150)
    };

    // reorder level 10 everywhere, overstock above 5 × 10 = 50
    await Inventory.create([
        { product: products.laptop._id, warehouse: delhi._id, quantity: 30, reorderLevel: 10 },                        // HEALTHY
        { product: products.mouse._id, warehouse: delhi._id, quantity: 6, reorderLevel: 10 },                          // LOW (6 < 10)
        { product: products.rice._id, warehouse: delhi._id, quantity: 5, reservedQuantity: 5, reorderLevel: 10 },     // OUT (0 available)
        { product: products.oil._id, warehouse: noida._id, quantity: 400, reorderLevel: 10 },                          // OVERSTOCKED
        { product: products.laptop._id, warehouse: noida._id, quantity: 0, reorderLevel: 10 }                          // OUT
    ]);
});

afterAll(async () => {
    await closeTestDB();
});

const createOrderDoc = (orderNumber, customer, extra = {}) =>
    Order.create({ orderNumber, customer, warehouse: delhi._id, createdBy: admin._id, ...extra });

// Mongoose sets createdAt itself, so tests move it on the collection directly
const setCreatedAt = (Model, id, isoDate) => Model.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(isoDate) } });

describe("Order payment status", () => {
    test("new orders start PENDING; staff can mark one PAID (audited)", async () => {
        const order = await createOrderDoc("ORD-1", { name: "Priya" });
        expect(order.paymentStatus).toBe("PENDING");

        const response = await staffAgent.put(`/api/orders/${order._id}/payment`).send({ paymentStatus: "PAID", note: "UPI" });

        expect(response.status).toBe(200);
        expect(response.body.data.order.paymentStatus).toBe("PAID");
        const log = await AuditLog.findOne({ action: "ORDER_PAYMENT_UPDATED" });
        expect(log.oldValue).toEqual({ paymentStatus: "PENDING" });
        expect(log.newValue).toEqual({ paymentStatus: "PAID" });
    });

    test("same status again → 409; unknown status → 422; manager (view only) → 403", async () => {
        const order = await createOrderDoc("ORD-1", { name: "Priya" });

        expect((await staffAgent.put(`/api/orders/${order._id}/payment`).send({ paymentStatus: "PENDING" })).status).toBe(409);
        expect((await staffAgent.put(`/api/orders/${order._id}/payment`).send({ paymentStatus: "LATER" })).status).toBe(422);
        expect((await managerAgent.put(`/api/orders/${order._id}/payment`).send({ paymentStatus: "PAID" })).status).toBe(403);
    });

    test("?paymentStatus= filters the order list", async () => {
        await createOrderDoc("ORD-1", { name: "A" }, { paymentStatus: "PAID" });
        await createOrderDoc("ORD-2", { name: "B" }, { paymentStatus: "REFUNDED" });
        await createOrderDoc("ORD-3", { name: "C" });

        const response = await staffAgent.get("/api/orders?paymentStatus=REFUNDED");

        expect(response.body.data.orders.map((o) => o.orderNumber)).toEqual(["ORD-2"]);
    });
});

describe("?sort= on lists", () => {
    test("orders: newest (default), oldest, amount_high", async () => {
        const first = await createOrderDoc("ORD-1", { name: "A" }, { totalAmount: 500 });
        const second = await createOrderDoc("ORD-2", { name: "B" }, { totalAmount: 9000 });
        const third = await createOrderDoc("ORD-3", { name: "C" }, { totalAmount: 100 });
        await setCreatedAt(Order, first._id, "2026-03-01T10:00:00Z");
        await setCreatedAt(Order, second._id, "2026-05-01T10:00:00Z");
        await setCreatedAt(Order, third._id, "2026-07-01T10:00:00Z");

        const numbers = async (query) => (await staffAgent.get(`/api/orders${query}`)).body.data.orders.map((o) => o.orderNumber);

        expect(await numbers("")).toEqual(["ORD-3", "ORD-2", "ORD-1"]);
        expect(await numbers("?sort=oldest")).toEqual(["ORD-1", "ORD-2", "ORD-3"]);
        expect(await numbers("?sort=amount_high")).toEqual(["ORD-2", "ORD-1", "ORD-3"]);
    });

    test("an unknown sort → 422 with the allowed choices", async () => {
        const response = await staffAgent.get("/api/orders?sort=cheapest");

        expect(response.status).toBe(422);
        expect(JSON.stringify(response.body)).toContain("newest, oldest, amount_high, amount_low");
    });

    test("warehouses by capacity, suppliers by name descending", async () => {
        await Warehouse.create({ name: "Agra Depot", code: "AGR-01", city: "Agra", capacity: 50 });
        await Supplier.create([
            { name: "Acme", email: "a@acme.in" },
            { name: "Zenith", email: "z@zenith.in" }
        ]);

        const warehouses = (await managerAgent.get("/api/warehouses?sort=capacity_low")).body.data.warehouses;
        const suppliers = (await managerAgent.get("/api/suppliers?sort=name_desc")).body.data.suppliers;

        expect(warehouses[0].code).toBe("AGR-01");
        expect(suppliers.map((s) => s.name)).toEqual(["Zenith", "Acme"]);
    });
});

describe("Inventory stock status, category, brand search and sort", () => {
    const skusFor = async (query) =>
        (await staffAgent.get(`/api/inventory${query}`)).body.data.inventories.map((row) => `${row.product.sku}@${row.warehouse.code}`).sort();

    test("each ?stockStatus= picks the right records", async () => {
        expect(await skusFor("?stockStatus=HEALTHY")).toEqual(["LAP-001@DEL-01"]);
        expect(await skusFor("?stockStatus=LOW_STOCK")).toEqual(["MOU-001@DEL-01"]);
        expect(await skusFor("?stockStatus=OUT_OF_STOCK")).toEqual(["LAP-001@NOI-01", "RICE-5KG@DEL-01"]);
        expect(await skusFor("?stockStatus=OVERSTOCKED")).toEqual(["OIL-1L@NOI-01"]);
    });

    test("?lowStock=true still means 'below reorder level' (low + out of stock)", async () => {
        expect(await skusFor("?lowStock=true")).toEqual(["LAP-001@NOI-01", "MOU-001@DEL-01", "RICE-5KG@DEL-01"]);
    });

    test("?category= and brand search", async () => {
        expect(await skusFor(`?category=${grocery._id}`)).toEqual(["OIL-1L@NOI-01", "RICE-5KG@DEL-01"]);
        expect(await skusFor("?search=logitech")).toEqual(["MOU-001@DEL-01"]);
        expect(await skusFor(`?category=${electronics._id}&stockStatus=OUT_OF_STOCK`)).toEqual(["LAP-001@NOI-01"]);
    });

    test("list rows carry the product's brand, prices and category name", async () => {
        const rows = (await staffAgent.get("/api/inventory?search=LAP-001&warehouse=" + delhi._id)).body.data.inventories;

        expect(rows[0].product).toMatchObject({ brand: "Dell", costPrice: 40000, sellingPrice: 80000, category: { name: "Electronics" } });
    });

    test("?sort=stock_high puts the fullest first", async () => {
        const rows = (await staffAgent.get("/api/inventory?sort=stock_high")).body.data.inventories;

        expect(rows[0].quantity).toBe(400);
        expect(rows.at(-1).quantity).toBe(0);
    });

    test("an unknown stock status → 422", async () => {
        expect((await staffAgent.get("/api/inventory?stockStatus=FULL")).status).toBe(422);
    });
});

describe("Wider search on purchases and transfers", () => {
    test("purchases can be found by supplier name", async () => {
        const acme = await Supplier.create({ name: "Acme Electronics", email: "a@acme.in" });
        const bharat = await Supplier.create({ name: "Bharat Foods", email: "b@bharat.in" });
        for (const [poNumber, supplier] of [["PO-000001", acme], ["PO-000002", bharat]]) {
            await PurchaseOrder.create({
                poNumber, supplier: supplier._id, warehouse: delhi._id, requestedBy: admin._id,
                items: [{ product: products.rice._id, quantityOrdered: 5, unitCost: 450 }]
            });
        }

        const response = await managerAgent.get("/api/purchases?search=bharat");

        expect(response.body.data.purchases.map((p) => p.poNumber)).toEqual(["PO-000002"]);
    });

    test("transfers can be found by product name, together with a warehouse filter", async () => {
        await StockTransfer.create([
            { transferNumber: "TRF-000001", product: products.laptop._id, fromWarehouse: delhi._id, toWarehouse: noida._id, quantity: 2, requestedBy: admin._id },
            { transferNumber: "TRF-000002", product: products.mouse._id, fromWarehouse: delhi._id, toWarehouse: noida._id, quantity: 2, requestedBy: admin._id }
        ]);

        const response = await managerAgent.get(`/api/transfers?search=mouse&warehouse=${noida._id}`);

        expect(response.body.data.transfers.map((t) => t.transferNumber)).toEqual(["TRF-000002"]);
    });
});

describe("Supplier cards: purchase orders and products supplied", () => {
    test("each supplier in the list carries how many POs it had and how many different products it supplied", async () => {
        const acme = await Supplier.create({ name: "Acme", email: "a@acme.in" });
        await Supplier.create({ name: "Zenith", email: "z@zenith.in" });
        const items = (...list) => list.map((product) => ({ product: product._id, quantityOrdered: 10, unitCost: 100 }));
        await PurchaseOrder.create([
            { poNumber: "PO-000001", supplier: acme._id, warehouse: delhi._id, requestedBy: admin._id, items: items(products.laptop, products.mouse) },
            { poNumber: "PO-000002", supplier: acme._id, warehouse: delhi._id, requestedBy: admin._id, items: items(products.mouse) }
        ]);

        const suppliers = (await managerAgent.get("/api/suppliers")).body.data.suppliers;

        expect(suppliers.map((s) => [s.name, s.purchaseCount, s.productCount])).toEqual([["Acme", 2, 2], ["Zenith", 0, 0]]);
    });
});

describe("GET /api/customers", () => {
    beforeEach(async () => {
        const orders = [
            ["ORD-1", { name: "Asha", email: "asha@example.com", phone: "111" }, 1000, "DELIVERED", "2026-04-01T10:00:00Z"],
            ["ORD-2", { name: "Asha Rao", email: "asha@example.com", phone: "111" }, 3000, "CONFIRMED", "2026-06-01T10:00:00Z"],
            ["ORD-3", { name: "Vikram", phone: "222" }, 500, "CANCELLED", "2026-05-01T10:00:00Z"],
            ["ORD-4", { name: "Zoya", email: "zoya@example.com" }, 200, "PENDING", "2026-02-01T10:00:00Z"]
        ];
        for (const [orderNumber, customer, totalAmount, status, date] of orders) {
            const order = await createOrderDoc(orderNumber, customer, { totalAmount, status });
            await setCreatedAt(Order, order._id, date);
        }
    });

    test("groups orders by email (or name + phone); cancelled orders don't count as spent", async () => {
        const response = await staffAgent.get("/api/customers");

        expect(response.status).toBe(200);
        expect(response.body.data.pagination.total).toBe(3);
        const [asha, vikram, zoya] = response.body.data.customers; // default: most recent order first
        expect(asha).toMatchObject({ name: "Asha Rao", email: "asha@example.com", orderCount: 2, openOrders: 1, totalSpent: 4000, lastOrderNumber: "ORD-2" });
        expect(vikram).toMatchObject({ name: "Vikram", email: null, orderCount: 1, totalSpent: 0 });
        expect(zoya.name).toBe("Zoya");
    });

    test("search, sort and paging", async () => {
        const names = async (query) => (await staffAgent.get(`/api/customers${query}`)).body.data.customers.map((c) => c.name);

        expect(await names("?search=zoya@")).toEqual(["Zoya"]);
        expect(await names("?sort=name")).toEqual(["Asha Rao", "Vikram", "Zoya"]);
        expect(await names("?sort=spent_high")).toEqual(["Asha Rao", "Zoya", "Vikram"]);
        expect(await names("?sort=name&page=2&limit=2")).toEqual(["Zoya"]);
    });

    test("suppliers may not see customers; not logged in → 401", async () => {
        expect((await supplierAgent.get("/api/customers")).status).toBe(403);
        expect((await request(app).get("/api/customers")).status).toBe(401);
    });
});

describe("POST /api/contact", () => {
    const message = { name: "Meera", email: "meera@example.com", subject: "Pricing", message: "Do you offer a demo for 3 stores?" };

    test("anyone can send a message; it is saved and every admin is notified", async () => {
        const response = await request(app).post("/api/contact").send(message);

        expect(response.status).toBe(201);
        expect(await ContactMessage.countDocuments()).toBe(1);
        const notification = await Notification.findOne({ recipient: admin._id });
        expect(notification.title).toBe("Contact form: Pricing");
        expect(notification.message).toContain("meera@example.com");
    });

    test("invalid fields → 422 and nothing is saved", async () => {
        const response = await request(app).post("/api/contact").send({ ...message, email: "not-an-email", message: "short" });

        expect(response.status).toBe(422);
        expect(await ContactMessage.countDocuments()).toBe(0);
    });
});

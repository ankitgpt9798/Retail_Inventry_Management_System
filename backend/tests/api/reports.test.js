const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Supplier = require("../../src/models/Supplier");
const Inventory = require("../../src/models/Inventory");
const StockTransaction = require("../../src/models/StockTransaction");
const Order = require("../../src/models/Order");
const OrderItem = require("../../src/models/OrderItem");
const PurchaseOrder = require("../../src/models/PurchaseOrder");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let managerAgent;
let staffAgent;
let supplierAgent;
let data;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Product.init(), Warehouse.init(), Inventory.init(), Order.init(), PurchaseOrder.init()]);
}, 20000);

// createdAt is normally set by Mongoose (and can't be changed through the model),
// so tests set it directly on the collection to place records in specific months
const setCreatedAt = (Model, id, isoDate) =>
    Model.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(isoDate) } });

// A small, fixed business. Every expected number in the tests is calculated from this.
const seedBusiness = async (admin) => {
    const electronics = await Category.create({ name: "Electronics" });
    const grocery = await Category.create({ name: "Grocery" });

    const laptop = await Product.create({ name: "Dell Laptop", sku: "LAP-001", category: electronics._id, costPrice: 40000, sellingPrice: 50000, reorderLevel: 5 });
    const mouse = await Product.create({ name: "Mouse", sku: "MOU-M185", category: electronics._id, costPrice: 500, sellingPrice: 700, reorderLevel: 20 });
    const rice = await Product.create({ name: "Basmati Rice", sku: "RICE-5KG", category: grocery._id, costPrice: 500, sellingPrice: 650, reorderLevel: 30 });
    await Product.create({ name: "Old Phone", sku: "OLD-1", category: electronics._id, costPrice: 1, sellingPrice: 2, status: "INACTIVE" });

    const delhi = await Warehouse.create({ name: "Delhi Central", code: "DEL-01", city: "Delhi", capacity: 1000 });
    const noida = await Warehouse.create({ name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 500 });
    const mumbai = await Warehouse.create({ name: "Mumbai Port", code: "MUM-01", city: "Mumbai", capacity: 1000 });

    // Inventory: laptop DEL 100 (10 reserved), laptop NOI 50, mouse DEL 8 (LOW: 8 < 20), rice NOI 200
    await Inventory.create([
        { product: laptop._id, warehouse: delhi._id, quantity: 100, reservedQuantity: 10, reorderLevel: 5 },
        { product: laptop._id, warehouse: noida._id, quantity: 50, reorderLevel: 5 },
        { product: mouse._id, warehouse: delhi._id, quantity: 8, reorderLevel: 20 },
        { product: rice._id, warehouse: noida._id, quantity: 200, reorderLevel: 30 }
    ]);

    // Stock movements
    const movements = [
        ["STOCK_IN", laptop, delhi, 10, "2026-08-12T10:00:00+05:30"],
        ["STOCK_IN", mouse, delhi, 30, "2026-08-12T10:00:00+05:30"],
        ["TRANSFER_OUT", laptop, delhi, 5, "2026-09-03T10:00:00+05:30"],
        ["TRANSFER_IN", laptop, noida, 5, "2026-09-04T10:00:00+05:30"],
        ["STOCK_OUT", laptop, delhi, 1, "2026-09-11T10:00:00+05:30"]
    ];
    for (const [type, product, warehouse, quantity, date] of movements) {
        const transaction = await StockTransaction.create({
            product: product._id, warehouse: warehouse._id, type, quantity,
            quantityBefore: 0, quantityAfter: 0, performedBy: admin._id
        });
        await setCreatedAt(StockTransaction, transaction._id, date);
    }

    // Orders (tax 0 to keep the maths simple)
    const orders = [
        ["ORD-1", "DELIVERED", delhi, [[laptop, 1]], "2026-08-15T10:00:00+05:30"],            // 50,000
        ["ORD-2", "SHIPPED", delhi, [[mouse, 2], [laptop, 1]], "2026-09-10T10:00:00+05:30"],   // 51,400
        ["ORD-3", "CONFIRMED", delhi, [[laptop, 10]], "2026-09-18T10:00:00+05:30"],           // 500,000
        ["ORD-4", "CANCELLED", delhi, [[mouse, 5]], "2026-09-20T10:00:00+05:30"],             // 3,500 (not revenue)
        ["ORD-5", "PENDING", noida, [[rice, 3]], "2026-09-25T10:00:00+05:30"],                // 1,950 (not revenue)
        // 20:00 UTC on 30 Sep = 01:30 on 1 OCTOBER in India
        ["ORD-6", "DELIVERED", delhi, [[mouse, 1]], "2026-09-30T20:00:00Z"]                    // 700
    ];
    for (const [orderNumber, status, warehouse, lines, date] of orders) {
        let total = 0;
        for (const [product, quantity] of lines) total += product.sellingPrice * quantity;

        const order = await Order.create({
            orderNumber, status, warehouse: warehouse._id, customer: { name: "Customer" },
            subtotal: total, taxAmount: 0, totalAmount: total, createdBy: admin._id
        });
        await OrderItem.insertMany(lines.map(([product, quantity]) => ({
            order: order._id, product: product._id, productName: product.name, sku: product.sku,
            unitPrice: product.sellingPrice, taxRate: 0, quantity,
            lineSubtotal: product.sellingPrice * quantity, lineTax: 0, lineTotal: product.sellingPrice * quantity
        })));
        await setCreatedAt(Order, order._id, date);
    }

    const acme = await Supplier.create({ name: "Acme Electronics", email: "sales@acme.in" });
    const bharat = await Supplier.create({ name: "Bharat Foods", email: "orders@bharat.in" });
    await Supplier.create({ name: "Idle Traders", email: "idle@traders.in" });

    // Purchase orders
    const purchases = [
        // PO1: 50 mice (30 received) + 10 laptops (all received) → total 425,000, received 415,000
        ["PO-1", acme, delhi, "PARTIALLY_RECEIVED", true,
            [[mouse, 50, 500, 30], [laptop, 10, 40000, 10]], "2026-08-10T10:00:00+05:30"],
        // PO2: 5 laptops, all received → 200,000
        ["PO-2", acme, noida, "RECEIVED", true, [[laptop, 5, 40000, 5]], "2026-09-05T10:00:00+05:30"],
        // PO3: sent, then cancelled, nothing received → 50,000 (not "ordered value")
        ["PO-3", bharat, noida, "CANCELLED", true, [[rice, 100, 500, 0]], "2026-09-12T10:00:00+05:30"],
        // PO4: waiting for approval, never sent → 20,000
        ["PO-4", bharat, noida, "PENDING", false, [[rice, 40, 500, 0]], "2026-09-20T10:00:00+05:30"]
    ];
    for (const [poNumber, supplier, warehouse, status, wasOrdered, items, date] of purchases) {
        let total = 0;
        for (const [, quantity, unitCost] of items) total += quantity * unitCost;

        const purchase = await PurchaseOrder.create({
            poNumber, supplier: supplier._id, warehouse: warehouse._id, status, totalAmount: total,
            requestedBy: admin._id, orderedAt: wasOrdered ? new Date(date) : undefined,
            items: items.map(([product, quantityOrdered, unitCost, quantityReceived]) => ({
                product: product._id, quantityOrdered, unitCost, quantityReceived
            }))
        });
        await setCreatedAt(PurchaseOrder, purchase._id, date);
    }

    return { electronics, grocery, laptop, mouse, rice, delhi, noida, mumbai, acme, bharat };
};

beforeEach(async () => {
    await clearTestDB();
    const admin = await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
    await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com" });
    await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });
    await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@shop.com" });
    managerAgent = await loginAgent("manager@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
    supplierAgent = await loginAgent("supplier@shop.com");
    data = await seedBusiness(admin);
});

afterAll(async () => {
    await closeTestDB();
});

const AUG_SEP = "from=2026-08-01&to=2026-09-30";

describe("Access control", () => {
    test("STAFF can open the dashboard but not the reports", async () => {
        expect((await staffAgent.get("/api/reports/dashboard")).status).toBe(200);
        expect((await staffAgent.get("/api/reports/orders")).status).toBe(403);
    });

    test("SUPPLIER gets nothing; not logged in → 401", async () => {
        expect((await supplierAgent.get("/api/reports/dashboard")).status).toBe(403);
        expect((await request(app).get("/api/reports/dashboard")).status).toBe(401);
    });
});

describe("GET /api/reports/dashboard", () => {
    test("the spec's 10 KPIs", async () => {
        const response = await staffAgent.get("/api/reports/dashboard");

        expect(response.body.data.kpis).toEqual({
            totalProducts: 3,        // active only (Old Phone is inactive)
            totalCategories: 2,
            totalWarehouses: 3,
            totalInventory: 358,     // 100 + 50 + 8 + 200
            totalOrders: 5,          // everything except the cancelled one
            pendingOrders: 2,        // ORD-3 (CONFIRMED) + ORD-5 (PENDING)
            completedOrders: 2,      // ORD-1 + ORD-6 (DELIVERED)
            lowStockProducts: 1,     // mouse
            totalSuppliers: 3,
            pendingPurchases: 2      // PO-1 (partially received) + PO-4 (pending)
        });
    });

    test("all 6 charts are present, with 6 zero-filled months", async () => {
        const { charts } = (await staffAgent.get("/api/reports/dashboard")).body.data;

        expect(Object.keys(charts).sort()).toEqual([
            "inventoryByWarehouse", "orderStatusDistribution", "ordersByMonth", "purchaseTrends", "stockMovement", "topProducts"
        ]);
        expect(charts.ordersByMonth).toHaveLength(6);
        expect(charts.stockMovement).toHaveLength(6);
        expect(charts.orderStatusDistribution).toHaveLength(7);
        expect(charts.inventoryByWarehouse.find((w) => w.code === "DEL-01")).toMatchObject({ quantity: 108, utilizationPercent: 10.8 });
    });
});

describe("GET /api/reports/inventory", () => {
    test("per product across warehouses, most valuable first", async () => {
        const { summary, rows } = (await managerAgent.get("/api/reports/inventory")).body.data;

        expect(rows.map((r) => [r.sku, r.quantity, r.reservedQuantity, r.availableQuantity, r.stockValue, r.warehouseCount])).toEqual([
            ["LAP-001", 150, 10, 140, 6000000, 2],   // 150 × 40,000
            ["RICE-5KG", 200, 0, 200, 100000, 1],    // 200 × 500
            ["MOU-M185", 8, 0, 8, 4000, 1]           // 8 × 500
        ]);
        expect(summary).toEqual({
            productCount: 3, totalQuantity: 358, totalReserved: 10, totalAvailable: 348, totalStockValue: 6104000
        });
    });

    test("filter by warehouse (the ObjectId-conversion trap) and by category", async () => {
        const delhiOnly = (await managerAgent.get(`/api/reports/inventory?warehouse=${data.delhi._id}`)).body.data;
        const groceryOnly = (await managerAgent.get(`/api/reports/inventory?category=${data.grocery._id}`)).body.data;

        expect(delhiOnly.rows.map((r) => [r.sku, r.quantity])).toEqual([["LAP-001", 100], ["MOU-M185", 8]]);
        expect(groceryOnly.rows.map((r) => r.sku)).toEqual(["RICE-5KG"]);
    });
});

describe("GET /api/reports/warehouses", () => {
    test("every warehouse (even empty ones) with utilization and value", async () => {
        const { summary, rows } = (await managerAgent.get("/api/reports/warehouses")).body.data;

        expect(rows.map((r) => [r.code, r.totalQuantity, r.reservedQuantity, r.productCount, r.utilizationPercent, r.stockValue])).toEqual([
            ["DEL-01", 108, 10, 2, 10.8, 4004000],   // 100 laptops + 8 mice
            ["MUM-01", 0, 0, 0, 0, 0],               // empty but listed
            ["NOI-01", 250, 0, 2, 50, 2100000]       // 250 of 500
        ]);
        expect(summary).toEqual({
            warehouseCount: 3, totalCapacity: 2500, totalQuantity: 358, totalStockValue: 6104000, overallUtilizationPercent: 14.3
        });
    });
});

describe("GET /api/reports/stock-movement", () => {
    test("totals per type and a zero-filled monthly series", async () => {
        const report = (await managerAgent.get("/api/reports/stock-movement?from=2026-07-01&to=2026-09-30")).body.data;

        expect(report.totals).toEqual({
            STOCK_IN: { quantity: 40, count: 2 },
            STOCK_OUT: { quantity: 1, count: 1 },
            TRANSFER_IN: { quantity: 5, count: 1 },
            TRANSFER_OUT: { quantity: 5, count: 1 },
            ADJUSTMENT: { quantity: 0, count: 0 }
        });
        expect(report.byMonth).toEqual([
            { month: "2026-07", STOCK_IN: 0, STOCK_OUT: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJUSTMENT: 0 },
            { month: "2026-08", STOCK_IN: 40, STOCK_OUT: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJUSTMENT: 0 },
            { month: "2026-09", STOCK_IN: 0, STOCK_OUT: 1, TRANSFER_IN: 5, TRANSFER_OUT: 5, ADJUSTMENT: 0 }
        ]);
    });

    test("filter by warehouse", async () => {
        const report = (await managerAgent.get(`/api/reports/stock-movement?${AUG_SEP}&warehouse=${data.noida._id}`)).body.data;

        expect(report.totals.TRANSFER_IN.quantity).toBe(5);
        expect(report.totals.STOCK_IN.quantity).toBe(0);
    });
});

describe("GET /api/reports/orders", () => {
    test("summary: revenue counts only confirmed-or-later, non-cancelled orders", async () => {
        const report = (await managerAgent.get(`/api/reports/orders?${AUG_SEP}`)).body.data;

        expect(report.range).toEqual({ from: "2026-08-01", to: "2026-09-30" });
        expect(report.summary).toEqual({
            totalOrders: 5,                // ORD-1…5 (ORD-6 is 1 Oct in India)
            salesOrders: 3,                // ORD-1, 2, 3
            cancelledOrders: 1,
            completedOrders: 1,
            revenue: 601400,               // 50,000 + 51,400 + 500,000
            averageOrderValue: 200466.67
        });
        expect(report.byMonth).toEqual([
            { month: "2026-08", orders: 1, revenue: 50000 },
            { month: "2026-09", orders: 2, revenue: 551400 }
        ]);
        expect(report.byStatus.find((s) => s.status === "CANCELLED")).toEqual({ status: "CANCELLED", count: 1, totalAmount: 3500 });
    });

    test("TIME ZONE: 20:00 UTC on 30 Sep is counted in October (India)", async () => {
        const report = (await managerAgent.get("/api/reports/orders?from=2026-08-01&to=2026-10-31")).body.data;

        expect(report.summary.completedOrders).toBe(2);
        expect(report.byMonth.at(-1)).toEqual({ month: "2026-10", orders: 1, revenue: 700 });
    });

    test("filter by warehouse", async () => {
        const report = (await managerAgent.get(`/api/reports/orders?${AUG_SEP}&warehouse=${data.noida._id}`)).body.data;

        expect(report.summary).toMatchObject({ totalOrders: 1, salesOrders: 0, revenue: 0, averageOrderValue: 0 });
    });
});

describe("GET /api/reports/purchases", () => {
    test("summary, by month; cancelled and unsent POs are not 'ordered value'", async () => {
        const report = (await managerAgent.get(`/api/reports/purchases?${AUG_SEP}`)).body.data;

        expect(report.summary).toEqual({
            totalPurchaseOrders: 4,
            openPurchaseOrders: 2,         // PO-1 + PO-4
            orderedValue: 625000,          // PO-1 425,000 + PO-2 200,000
            receivedValue: 615000          // 30×500 + 10×40,000 + 5×40,000
        });
        expect(report.byMonth).toEqual([
            { month: "2026-08", purchaseOrders: 1, value: 425000 },
            { month: "2026-09", purchaseOrders: 2, value: 220000 }   // PO-2 + PO-4 (PO-3 cancelled)
        ]);
    });

    test("filter by supplier", async () => {
        const report = (await managerAgent.get(`/api/reports/purchases?${AUG_SEP}&supplier=${data.bharat._id}`)).body.data;

        expect(report.summary).toEqual({ totalPurchaseOrders: 2, openPurchaseOrders: 1, orderedValue: 0, receivedValue: 0 });
    });
});

describe("GET /api/reports/suppliers", () => {
    test("every supplier with volume, value and fulfilment rate", async () => {
        const { rows } = (await managerAgent.get(`/api/reports/suppliers?${AUG_SEP}`)).body.data;

        expect(rows.map((r) => [r.name, r.purchaseOrders, r.unitsOrdered, r.unitsReceived, r.orderedValue, r.receivedValue, r.fulfilmentRatePercent, r.openPurchaseOrders]))
            .toEqual([
                ["Acme Electronics", 2, 65, 45, 625000, 615000, 69.2, 1],   // 45 / 65 = 69.2 %
                ["Bharat Foods", 0, 0, 0, 0, 0, null, 0],                     // cancelled + never-sent don't count
                ["Idle Traders", 0, 0, 0, 0, 0, null, 0]
            ]);
    });
});

describe("GET /api/reports/low-stock", () => {
    test("shortage and quantity already on order", async () => {
        const { summary, rows } = (await managerAgent.get("/api/reports/low-stock")).body.data;

        expect(summary).toEqual({ itemCount: 1, totalShortage: 12 });
        expect(rows[0]).toMatchObject({
            product: { sku: "MOU-M185" },
            warehouse: { code: "DEL-01" },
            availableQuantity: 8,
            reorderLevel: 20,
            shortage: 12,
            onOrderQuantity: 20        // PO-1: 50 ordered − 30 received
        });
    });
});

describe("GET /api/reports/product-performance", () => {
    test("only shipped/delivered orders count as sold", async () => {
        const { rows } = (await managerAgent.get(`/api/reports/product-performance?${AUG_SEP}`)).body.data;

        // ORD-1 (1 laptop) + ORD-2 (1 laptop, 2 mice); the confirmed 10-laptop order is not sold yet
        expect(rows).toEqual([
            { productId: data.laptop._id.toString(), name: "Dell Laptop", sku: "LAP-001", unitsSold: 2, revenue: 100000, orderCount: 2 },
            { productId: data.mouse._id.toString(), name: "Mouse", sku: "MOU-M185", unitsSold: 2, revenue: 1400, orderCount: 1 }
        ]);
    });

    test("sortBy units vs revenue, and limit", async () => {
        const range = "from=2026-08-01&to=2026-10-31";   // includes ORD-6 (1 more mouse)

        const byUnits = (await managerAgent.get(`/api/reports/product-performance?${range}`)).body.data.rows;
        const byRevenue = (await managerAgent.get(`/api/reports/product-performance?${range}&sortBy=revenue&limit=1`)).body.data.rows;

        expect(byUnits.map((r) => [r.sku, r.unitsSold])).toEqual([["MOU-M185", 3], ["LAP-001", 2]]);
        expect(byRevenue.map((r) => r.sku)).toEqual(["LAP-001"]);
    });
});

describe("Validation", () => {
    test.each([
        ["/api/reports/orders?from=2026-9-1", "from must be a date like 2026-09-30"],
        ["/api/reports/orders?from=2026-02-30", "from is not a real date"],
        ["/api/reports/orders?from=2026-10-01&to=2026-09-01", "from cannot be after to"],
        ["/api/reports/inventory?warehouse=abc", "Invalid id"],
        ["/api/reports/product-performance?sortBy=profit", "sortBy must be units or revenue"],
        ["/api/reports/product-performance?limit=500", "limit cannot be more than 100"]
    ])("%s → 422", async (url, expectedMessage) => {
        const response = await managerAgent.get(url);

        expect(response.status).toBe(422);
        expect(response.body.message).toBe(expectedMessage);
    });
});

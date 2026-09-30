// Run with: npm run seed
//
// Fills the DEVELOPMENT database with realistic, related demo data so every page, filter,
// sort and pagination can be tried: 10 categories, 50 products, 6 warehouses, ~70 stock records,
// 15 suppliers, 30 customers, 50 orders, 25 purchase orders, 20 transfers, stock adjustments,
// low-stock notifications — spread over the last 12 months.
//
// SAFE TO RUN AGAIN: it first DELETES the business data (products, stock, orders, purchases…)
// and creates it fresh, so nothing is duplicated. User accounts are KEPT (passwords unchanged);
// missing demo accounts are added. It refuses to run when NODE_ENV=production.
//
// The numbers are "random" but always the same (a seeded random generator), and they are
// CONSISTENT: every stock quantity equals its history (opening stock + receipts − shipments …).
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const Category = require("../models/Category");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
const Supplier = require("../models/Supplier");
const Inventory = require("../models/Inventory");
const StockTransaction = require("../models/StockTransaction");
const StockTransfer = require("../models/StockTransfer");
const PurchaseOrder = require("../models/PurchaseOrder");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Counter = require("../models/Counter");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const roundMoney = require("./roundMoney");
const { hashPassword } = require("../services/authService");
const { calculateLine, calculateOrderTotals } = require("../services/orderService");
const { ROLES, USER_STATUS, OVERSTOCK_FACTOR } = require("./constants");
const demo = require("./demoData");

// ---------- Deterministic "random" numbers ----------

// mulberry32: a tiny random generator. The same seed always gives the same sequence,
// so every run creates the same demo data (only the dates move along with today).
let seed = 20260930;
const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const shuffle = (list) => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};
const pickSome = (list, count) => shuffle(list).slice(0, count);

// ---------- Dates ----------

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.now();
// A time during working hours, `days` days ago
const daysAgo = (days) => {
    const date = new Date(NOW - days * DAY);
    date.setHours(9 + (Math.abs(days * 7) % 9), (days * 13) % 60, 0, 0);
    return date.getTime() > NOW ? new Date(NOW - HOUR) : date;
};
const later = (date, hours) => new Date(Math.min(date.getTime() + hours * HOUR, NOW - 10 * 60 * 1000));

// ---------- Saving with our own createdAt ----------

// Mongoose normally stamps createdAt with "now". Demo records need dates in the past, so each
// document is built and VALIDATED by its model, then written to the collection directly.
const insertWithDates = async (Model, docs) => {
    const built = docs.map((doc) => new Model(doc));
    for (const doc of built) {
        await doc.validate();
    }
    if (built.length > 0) {
        await Model.collection.insertMany(built.map((doc) => ({ __v: 0, ...doc.toObject({ virtuals: false }) })));
    }
    return built;
};

// ---------- Safety ----------

const checkEnvironment = () => {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to seed: NODE_ENV is production. Demo data is for development only.");
    }
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not set in .env");
    }
};

// Business collections that are emptied and filled again. Users are NOT in this list.
const BUSINESS_MODELS = [Category, Product, Warehouse, Supplier, Inventory, StockTransaction, StockTransfer, PurchaseOrder, Order, OrderItem, Counter, Notification];

const clearBusinessData = async () => {
    for (const Model of BUSINESS_MODELS) {
        await Model.deleteMany({});
    }
    // The audit log model blocks deletes on purpose (it is append-only in the app).
    // Old entries would point at records that no longer exist, so the seed clears the collection directly.
    await AuditLog.collection.deleteMany({});
};

// ---------- 1. Users ----------

const ensureUsers = async () => {
    const admin = await User.findOne({ role: ROLES.ADMIN, status: USER_STATUS.ACTIVE }).sort({ createdAt: 1 });
    if (!admin) {
        throw new Error("No active admin found. Run `npm run seed:admin` first, then `npm run seed`.");
    }

    const users = { admin };
    let created = 0;
    for (const person of demo.DEMO_USERS) {
        let user = await User.findOne({ email: person.email });
        if (!user) {
            user = await User.create({
                name: person.name,
                email: person.email,
                password: await hashPassword(person.password),
                role: person.role,
                status: USER_STATUS.ACTIVE
            });
            created++;
        }
        users[person.key] = user;
    }
    console.log(`Users: kept ${demo.DEMO_USERS.length - created + 1}, created ${created}`);
    return users;
};

// ---------- 2. Catalog, warehouses, suppliers ----------

const createCatalog = async (users) => {
    const categoryDocs = demo.CATEGORIES.map((category, index) => ({
        name: category.name,
        description: category.description,
        createdAt: daysAgo(400 - index),
        updatedAt: daysAgo(400 - index)
    }));
    const categories = await insertWithDates(Category, categoryDocs);
    const categoryByName = Object.fromEntries(categories.map((category) => [category.name, category]));

    const productDocs = [];
    demo.CATEGORIES.forEach((category, categoryIndex) => {
        demo.PRODUCTS[category.name].forEach(([name, brand, costPrice, sellingPrice, status], index) => {
            const createdAt = daysAgo(390 - categoryIndex * 3 - index * 7);
            productDocs.push({
                name,
                brand,
                sku: `${category.prefix}-${101 + index}`,
                description: `${name} by ${brand}.`,
                category: categoryByName[category.name]._id,
                costPrice,
                sellingPrice,
                taxRate: category.taxRate,
                reorderLevel: category.reorderLevel,
                status: status || "ACTIVE",
                createdBy: users.admin._id,
                createdAt,
                updatedAt: createdAt
            });
        });
    });
    const products = await insertWithDates(Product, productDocs);
    // Each product remembers its category name (used to match suppliers)
    products.forEach((product) => {
        product.categoryName = categories.find((category) => category._id.equals(product.category)).name;
    });

    const warehouses = await insertWithDates(
        Warehouse,
        demo.WAREHOUSES.map((warehouse, index) => ({
            ...warehouse,
            manager: warehouse.manager ? users[warehouse.manager]._id : undefined,
            status: warehouse.status || "ACTIVE",
            createdAt: daysAgo(420 - index * 5),
            updatedAt: daysAgo(420 - index * 5)
        }))
    );

    const suppliers = await insertWithDates(
        Supplier,
        demo.SUPPLIERS.map(({ categories: supplied, ...supplier }, index) => ({
            ...supplier,
            status: supplier.status || "ACTIVE",
            createdAt: daysAgo(410 - index * 4),
            updatedAt: daysAgo(index < 12 ? 410 - index * 4 : 30 + index)
        }))
    );
    suppliers.forEach((supplier, index) => {
        supplier.categories = demo.SUPPLIERS[index].categories;
    });

    // Supplier logins: point each one at its company again (the old supplier records were deleted)
    for (const person of demo.DEMO_USERS.filter((user) => user.supplier)) {
        const company = suppliers.find((supplier) => supplier.name === person.supplier);
        await User.updateOne({ _id: users[person.key]._id }, { $set: { supplier: company._id } });
    }
    const orphans = await User.find({ role: ROLES.SUPPLIER, supplier: { $nin: suppliers.map((supplier) => supplier._id) } });
    for (const user of orphans) {
        // Any other supplier login gets linked to the first supplier so it can still log in
        await User.updateOne({ _id: user._id }, { $set: { supplier: suppliers[0]._id } });
        console.log(`  Supplier login ${user.email} re-linked to ${suppliers[0].name}`);
    }

    return { categories, products, warehouses, suppliers };
};

// ---------- 3. Stock records (which product is kept where) ----------

// The stock condition each record should END with (see STOCK_STATUS in constants)
const TARGET_STATUSES = [
    ...Array(38).fill("HEALTHY"),
    ...Array(13).fill("LOW_STOCK"),
    ...Array(9).fill("OUT_OF_STOCK"),
    ...Array(10).fill("OVERSTOCKED")
];

const planInventory = (products, activeWarehouses) => {
    const rows = [];
    const activeProducts = products.filter((product) => product.status === "ACTIVE");
    activeProducts.forEach((product, index) => {
        const home = activeWarehouses[index % activeWarehouses.length];
        const places = [home];
        // About half the products are also kept in a second warehouse
        if (random() < 0.5) {
            places.push(pick(activeWarehouses.filter((warehouse) => warehouse !== home)));
        }
        for (const warehouse of places) {
            rows.push({ product, warehouse, reorderLevel: product.reorderLevel, reserved: 0, events: [] });
        }
    });

    const statuses = shuffle(TARGET_STATUSES);
    rows.forEach((row, index) => {
        row.targetStatus = statuses[index % statuses.length];
    });
    return rows;
};

const findRow = (rows, product, warehouse) => rows.find((row) => row.product === product && row.warehouse === warehouse);

// ---------- 4. Orders ----------

const ORDER_STATUS_PLAN = [
    ...Array(25).fill("DELIVERED"),
    ...Array(6).fill("CANCELLED"),
    ...Array(5).fill("SHIPPED"),
    ...Array(3).fill("PACKED"),
    ...Array(3).fill("PROCESSING"),
    ...Array(3).fill("CONFIRMED"),
    ...Array(5).fill("PENDING")
];

// Each status, with the steps an order goes through to get there
const ORDER_PATH = {
    PENDING: ["PENDING"],
    CONFIRMED: ["PENDING", "CONFIRMED"],
    PROCESSING: ["PENDING", "CONFIRMED", "PROCESSING"],
    PACKED: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"],
    SHIPPED: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED"],
    DELIVERED: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"]
};

const PAYMENT_PLAN = {
    DELIVERED: ["PAID", "PAID", "PAID", "PAID", "PAID", "PAID", "PARTIALLY_PAID", "PENDING"],
    SHIPPED: ["PAID", "PAID", "PENDING"],
    PACKED: ["PAID", "PENDING"],
    PROCESSING: ["PAID", "PARTIALLY_PAID"],
    CONFIRMED: ["PAID", "PENDING"],
    PENDING: ["PENDING", "PENDING", "FAILED"],
    CANCELLED: ["REFUNDED", "REFUNDED", "FAILED", "PENDING"]
};

const buildOrders = (rows, activeWarehouses, users) => {
    const staff = [users.sunita, users.rahul, users.neha, users.admin];
    const statuses = shuffle(ORDER_STATUS_PLAN.slice(0, 31)); // the "old" statuses (delivered / cancelled)
    const recentStatuses = shuffle(ORDER_STATUS_PLAN.slice(31)); // still moving through fulfillment

    // Everyone orders at least once; 20 orders come from returning customers
    const customerOrder = [...shuffle(demo.CUSTOMERS), ...Array.from({ length: 20 }, () => pick(demo.CUSTOMERS))];

    // Old orders: 20–360 days ago. Recent ones (still open): the last 18 days.
    const ages = [
        ...Array.from({ length: 31 }, () => randomInt(12, 360)),
        ...Array.from({ length: 19 }, () => randomInt(0, 18))
    ];
    const plan = ages.map((age, index) => ({ age, status: index < 31 ? statuses[index] : recentStatuses[index - 31] }));
    // Open orders must be recent; a PENDING order can be the very newest
    plan.sort((a, b) => b.age - a.age);

    const orders = [];
    plan.forEach(({ age, status }, index) => {
        const [name, email, phone, address] = customerOrder[index];
        const warehouse = pick(activeWarehouses);
        const available = rows.filter((row) => row.warehouse === warehouse && row.targetStatus !== "OUT_OF_STOCK");
        const lines = pickSome(available, randomInt(1, 3)).map((row) => ({ row, quantity: randomInt(1, row.product.sellingPrice > 3000 ? 2 : 5) }));

        const createdAt = daysAgo(age + random() * 0.5);
        const path = status === "CANCELLED" ? (random() < 0.5 ? ["PENDING", "CANCELLED"] : ["PENDING", "CONFIRMED", "CANCELLED"]) : ORDER_PATH[status];
        // Steps are spread over a few days, but never into the future
        const stepHours = age < 2 ? 3 : age < 6 ? 16 : 30;
        const history = path.map((step, stepIndex) => ({
            status: step,
            changedBy: pick(staff)._id,
            changedAt: later(createdAt, stepIndex * stepHours),
            note: step === "CANCELLED" ? "Cancelled at the customer's request" : undefined
        }));

        orders.push({
            orderNumber: `ORD-${String(index + 1).padStart(6, "0")}`,
            customer: { name, email: email || undefined, phone, address },
            warehouse,
            status,
            path,
            history,
            createdAt,
            lines,
            createdBy: pick(staff),
            paymentStatus: pick(PAYMENT_PLAN[status])
        });
    });

    // What each order does to the stock
    for (const order of orders) {
        const shipped = order.history.find((step) => step.status === "SHIPPED");
        for (const line of order.lines) {
            if (shipped) {
                line.row.events.push({ date: shipped.changedAt, delta: -line.quantity, type: "STOCK_OUT", referenceType: "ORDER", order, note: `Shipped on ${order.orderNumber}`, user: shipped.changedBy });
            }
            else if (["CONFIRMED", "PROCESSING", "PACKED"].includes(order.status)) {
                line.row.reserved += line.quantity;
            }
        }
    }
    return orders;
};

const saveOrders = async (orders) => {
    const orderDocs = [];
    const itemDocs = [];
    for (const order of orders) {
        const _id = new mongoose.Types.ObjectId();
        order._id = _id;
        const lines = order.lines.map(({ row, quantity }) => {
            const { product } = row;
            const line = { unitPrice: product.sellingPrice, taxRate: product.taxRate, quantity };
            return { ...line, ...calculateLine(line), product };
        });
        const totals = calculateOrderTotals(lines);
        const shipped = order.history.find((step) => step.status === "SHIPPED");
        const cancelled = order.status === "CANCELLED";
        const lastChange = order.history.at(-1).changedAt;

        orderDocs.push({
            _id,
            orderNumber: order.orderNumber,
            customer: order.customer,
            warehouse: order.warehouse._id,
            status: order.status,
            statusHistory: order.history,
            paymentStatus: order.paymentStatus,
            ...totals,
            carrier: shipped ? pick(demo.CARRIERS) : undefined,
            trackingNumber: shipped ? `TRK${randomInt(10000000, 99999999)}` : undefined,
            cancelReason: cancelled ? pick(["Customer changed their mind", "Duplicate order", "Payment not received in time"]) : undefined,
            notes: random() < 0.2 ? pick(["Deliver after 5 pm", "Gift wrap please", "Call before delivery"]) : undefined,
            createdBy: order.createdBy._id,
            createdAt: order.createdAt,
            updatedAt: lastChange
        });
        lines.forEach((line) => {
            itemDocs.push({
                order: _id,
                product: line.product._id,
                productName: line.product.name,
                sku: line.product.sku,
                unitPrice: line.unitPrice,
                taxRate: line.taxRate,
                quantity: line.quantity,
                lineSubtotal: line.lineSubtotal,
                lineTax: line.lineTax,
                lineTotal: line.lineTotal,
                createdAt: order.createdAt,
                updatedAt: order.createdAt
            });
        });
    }
    await insertWithDates(Order, orderDocs);
    await insertWithDates(OrderItem, itemDocs);
};

// ---------- 5. Purchase orders ----------

// Oldest first: old POs are finished, recent ones are still in progress
const PURCHASE_STATUS_PLAN = [
    "RECEIVED", "RECEIVED", "REJECTED", "RECEIVED", "CANCELLED", "RECEIVED", "RECEIVED", "RECEIVED",
    "REJECTED", "RECEIVED", "CANCELLED", "RECEIVED", "PARTIALLY_RECEIVED", "ORDERED", "PARTIALLY_RECEIVED",
    "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "PENDING", "ORDERED", "APPROVED", "PENDING", "DRAFT", "PENDING", "DRAFT"
];
const CLOSED_PURCHASE = ["RECEIVED", "REJECTED", "CANCELLED"];

const buildPurchases = (rows, suppliers, users) => {
    const managers = [users.ravi, users.kavya, users.arjun];
    const purchases = [];

    PURCHASE_STATUS_PLAN.forEach((status, index) => {
        // Inactive suppliers only appear on finished POs (an open PO would block deactivating them)
        const candidates = suppliers.filter((supplier) => supplier.status === "ACTIVE" || CLOSED_PURCHASE.includes(status));
        const supplier = candidates[(index * 7) % candidates.length];
        const supplied = rows.filter((row) => supplier.categories.includes(row.product.categoryName));
        const warehouse = pick(supplied).warehouse;
        const lines = pickSome(supplied.filter((row) => row.warehouse === warehouse), randomInt(1, 4));

        const age = Math.round(340 - index * 13.5) + randomInt(0, 4);
        const createdAt = daysAgo(age);
        const requestedBy = pick(managers);
        const items = lines.map((row) => ({
            row,
            quantityOrdered: randomInt(2, 12) * 10,
            unitCost: roundMoney(row.product.costPrice * (0.95 + random() * 0.08)),
            quantityReceived: 0
        }));

        const purchase = { poNumber: `PO-${String(index + 1).padStart(6, "0")}`, supplier, warehouse: lines[0].warehouse, status, items, createdAt, requestedBy };
        const approveAt = later(createdAt, 20);
        const orderAt = later(createdAt, 30);
        if (!["DRAFT", "PENDING", "REJECTED"].includes(status)) {
            Object.assign(purchase, { approvedBy: users.admin, approvedAt: approveAt });
        }
        if (status === "REJECTED") {
            Object.assign(purchase, { rejectedBy: users.admin, rejectedAt: approveAt, rejectionReason: pick(["Price is higher than last quarter", "Enough stock already on hand", "Please combine with next month's order"]) });
        }
        if (["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"].includes(status)) {
            Object.assign(purchase, { orderedBy: requestedBy, orderedAt: orderAt, expectedDeliveryDate: later(createdAt, 24 * 7) });
            if (status !== "CANCELLED" && random() < 0.7) {
                purchase.supplierConfirmedAt = later(orderAt, 12);
                purchase.deliveryNote = pick(["Dispatched via road transport", "Will deliver in two lots", "Ready for dispatch"]);
            }
        }
        if (status === "CANCELLED") {
            Object.assign(purchase, { cancelledBy: requestedBy, cancelledAt: later(orderAt, 48), cancelReason: "Supplier could not deliver on time" });
        }
        if (status === "DRAFT" || status === "PENDING" || status === "APPROVED") {
            purchase.expectedDeliveryDate = new Date(NOW + randomInt(5, 20) * DAY);
        }

        // Goods arriving (first delivery ~5 days after ordering, a second one a few days later)
        if (status === "RECEIVED" || status === "PARTIALLY_RECEIVED") {
            const firstDelivery = later(orderAt, 24 * randomInt(3, 6));
            const secondDelivery = later(firstDelivery, 24 * randomInt(2, 4));
            items.forEach((item, itemIndex) => {
                const partial = status === "PARTIALLY_RECEIVED" && itemIndex === 0;
                const quantity = partial ? Math.round(item.quantityOrdered / 2) : item.quantityOrdered;
                const when = status === "RECEIVED" && itemIndex > 0 && random() < 0.4 ? secondDelivery : firstDelivery;
                item.quantityReceived = quantity;
                item.row.events.push({ date: when, delta: quantity, type: "STOCK_IN", referenceType: "PURCHASE_ORDER", purchase, note: `Received on ${purchase.poNumber}`, user: requestedBy._id });
                purchase.lastReceiptAt = purchase.lastReceiptAt && purchase.lastReceiptAt > when ? purchase.lastReceiptAt : when;
            });
            if (status === "RECEIVED") purchase.receivedAt = purchase.lastReceiptAt;
        }
        purchases.push(purchase);
    });
    return purchases;
};

const savePurchases = async (purchases) => {
    const docs = purchases.map((purchase) => {
        purchase._id = new mongoose.Types.ObjectId();
        const items = purchase.items.map((item) => ({
            product: item.row.product._id,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: item.quantityReceived,
            unitCost: item.unitCost
        }));
        const lastChange = [purchase.receivedAt, purchase.lastReceiptAt, purchase.cancelledAt, purchase.supplierConfirmedAt, purchase.orderedAt, purchase.rejectedAt, purchase.approvedAt, purchase.createdAt]
            .find(Boolean);
        return {
            _id: purchase._id,
            poNumber: purchase.poNumber,
            supplier: purchase.supplier._id,
            warehouse: purchase.warehouse._id,
            items,
            status: purchase.status,
            totalAmount: roundMoney(items.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0)),
            expectedDeliveryDate: purchase.expectedDeliveryDate,
            notes: random() < 0.3 ? "Monthly replenishment" : undefined,
            rejectionReason: purchase.rejectionReason,
            cancelReason: purchase.cancelReason,
            supplierConfirmedAt: purchase.supplierConfirmedAt,
            deliveryNote: purchase.deliveryNote,
            requestedBy: purchase.requestedBy._id,
            approvedBy: purchase.approvedBy?._id,
            approvedAt: purchase.approvedAt,
            rejectedBy: purchase.rejectedBy?._id,
            rejectedAt: purchase.rejectedAt,
            orderedBy: purchase.orderedBy?._id,
            orderedAt: purchase.orderedAt,
            cancelledBy: purchase.cancelledBy?._id,
            cancelledAt: purchase.cancelledAt,
            receivedAt: purchase.receivedAt,
            createdAt: purchase.createdAt,
            updatedAt: lastChange
        };
    });
    await insertWithDates(PurchaseOrder, docs);
};

// ---------- 6. Transfers ----------

const TRANSFER_STATUS_PLAN = [
    "RECEIVED", "RECEIVED", "REJECTED", "RECEIVED", "CANCELLED", "RECEIVED", "RECEIVED", "RECEIVED", "REJECTED",
    "RECEIVED", "CANCELLED", "DISPATCHED", "APPROVED", "DISPATCHED", "REQUESTED", "APPROVED", "DISPATCHED",
    "REQUESTED", "APPROVED", "REQUESTED"
];

const buildTransfers = (rows, users) => {
    const managers = [users.ravi, users.kavya, users.arjun];
    // Products kept in two warehouses can move between them
    const pairs = [];
    for (const row of rows) {
        const other = rows.find((candidate) => candidate.product === row.product && candidate !== row);
        if (other) pairs.push([row, other]);
    }

    return TRANSFER_STATUS_PLAN.map((status, index) => {
        const [from, to] = pairs[(index * 5) % pairs.length];
        const age = Math.round(330 - index * 17) + randomInt(0, 3);
        const createdAt = daysAgo(age);
        const requestedBy = pick(managers);
        const approver = pick([users.admin, ...managers.filter((manager) => manager !== requestedBy)]);
        const transfer = {
            transferNumber: `TRF-${String(index + 1).padStart(6, "0")}`,
            from,
            to,
            quantity: randomInt(1, 6) * 5,
            status,
            createdAt,
            requestedBy,
            notes: pick(["Balancing stock before the weekend sale", "Store running low", "Moving slow stock closer to customers", undefined])
        };
        const decidedAt = later(createdAt, 6);
        if (["APPROVED", "DISPATCHED", "RECEIVED"].includes(status)) Object.assign(transfer, { approvedBy: approver, approvedAt: decidedAt });
        if (status === "REJECTED") Object.assign(transfer, { rejectedBy: approver, rejectedAt: decidedAt, rejectionReason: "Destination has enough stock" });
        if (status === "CANCELLED") Object.assign(transfer, { cancelledBy: requestedBy, cancelledAt: decidedAt, cancelReason: "No longer needed" });
        if (status === "DISPATCHED" || status === "RECEIVED") {
            transfer.dispatchedBy = from.warehouse.manager ? { _id: from.warehouse.manager } : requestedBy;
            transfer.dispatchedAt = later(createdAt, 20);
            from.events.push({ date: transfer.dispatchedAt, delta: -transfer.quantity, type: "TRANSFER_OUT", referenceType: "TRANSFER", transfer, note: `Transfer ${transfer.transferNumber} dispatched`, user: transfer.dispatchedBy._id });
        }
        if (status === "RECEIVED") {
            transfer.receivedBy = to.warehouse.manager ? { _id: to.warehouse.manager } : requestedBy;
            transfer.receivedAt = later(transfer.dispatchedAt, 40);
            to.events.push({ date: transfer.receivedAt, delta: transfer.quantity, type: "TRANSFER_IN", referenceType: "TRANSFER", transfer, note: `Transfer ${transfer.transferNumber} received`, user: transfer.receivedBy._id });
        }
        return transfer;
    });
};

const saveTransfers = async (transfers) => {
    const docs = transfers.map((transfer) => {
        transfer._id = new mongoose.Types.ObjectId();
        return {
            _id: transfer._id,
            transferNumber: transfer.transferNumber,
            product: transfer.from.product._id,
            fromWarehouse: transfer.from.warehouse._id,
            toWarehouse: transfer.to.warehouse._id,
            quantity: transfer.quantity,
            status: transfer.status,
            notes: transfer.notes,
            rejectionReason: transfer.rejectionReason,
            cancelReason: transfer.cancelReason,
            requestedBy: transfer.requestedBy._id,
            approvedBy: transfer.approvedBy?._id,
            approvedAt: transfer.approvedAt,
            rejectedBy: transfer.rejectedBy?._id,
            rejectedAt: transfer.rejectedAt,
            cancelledBy: transfer.cancelledBy?._id,
            cancelledAt: transfer.cancelledAt,
            dispatchedBy: transfer.dispatchedBy?._id,
            dispatchedAt: transfer.dispatchedAt,
            receivedBy: transfer.receivedBy?._id,
            receivedAt: transfer.receivedAt,
            createdAt: transfer.createdAt,
            updatedAt: transfer.receivedAt || transfer.dispatchedAt || transfer.approvedAt || transfer.rejectedAt || transfer.cancelledAt || transfer.createdAt
        };
    });
    await insertWithDates(StockTransfer, docs);
};

// ---------- 7. Adjustments, then the final stock of every record ----------

const addAdjustments = (rows, users) => {
    const withStock = rows.filter((row) => row.targetStatus !== "OUT_OF_STOCK");
    pickSome(withStock, 12).forEach((row, index) => {
        const goesUp = index % 4 === 3;
        row.events.push({
            date: daysAgo(randomInt(8, 300)),
            delta: goesUp ? randomInt(1, 4) : -randomInt(1, 6),
            type: "ADJUSTMENT",
            referenceType: "MANUAL",
            note: pick(goesUp ? demo.ADJUSTMENT_NOTES.up : demo.ADJUSTMENT_NOTES.down),
            user: row.warehouse.manager || users.admin._id
        });
    });
};

// The quantity each record should END with, for its target condition
const targetQuantity = (row) => {
    const level = row.reorderLevel;
    switch (row.targetStatus) {
        case "OUT_OF_STOCK":
            return row.reserved;                                                  // everything left is promised
        case "LOW_STOCK":
            return row.reserved + randomInt(1, level - 1);                        // some, but below the level
        case "OVERSTOCKED":
            return row.reserved + level * OVERSTOCK_FACTOR + randomInt(level, level * 3); // well above 5 × level
        default:
            return row.reserved + randomInt(level, level * 3);                    // comfortably above the level
    }
};

// Replays each record's history in date order. The opening stock (a year ago) is chosen so the
// record ends at its target without ever going below zero; if that is impossible, a recent
// "stock count correction" adjustment closes the gap.
const settleStock = (rows, users) => {
    const openingDate = daysAgo(375);
    for (const row of rows) {
        row.events.sort((a, b) => a.date - b.date);
        let running = 0;
        let lowest = 0;
        for (const event of row.events) {
            running += event.delta;
            lowest = Math.min(lowest, running);
        }
        const target = targetQuantity(row);
        const opening = Math.max(target - running, -lowest, 0);
        const final = opening + running;
        if (final !== target) {
            // After the record's last movement, so the history stays in date order
            const lastDate = row.events.length > 0 ? row.events.at(-1).date.getTime() : 0;
            row.events.push({
                date: new Date(Math.min(Math.max(lastDate + HOUR, daysAgo(randomInt(1, 4)).getTime()), NOW - 5 * 60 * 1000)),
                delta: target - final,
                type: "ADJUSTMENT",
                referenceType: "MANUAL",
                note: target < final ? "Stock count correction: damaged and expired units written off" : "Stock count correction",
                user: row.warehouse.manager || users.admin._id
            });
        }
        if (opening > 0) {
            row.events.unshift({ date: openingDate, delta: opening, type: "STOCK_IN", referenceType: "MANUAL", note: "Opening stock", user: row.warehouse.manager || users.admin._id });
        }
        row.quantity = target;
    }
};

const saveStock = async (rows) => {
    const inventoryDocs = [];
    const transactionDocs = [];
    for (const row of rows) {
        const inventoryId = new mongoose.Types.ObjectId();
        let quantity = 0;
        for (const event of row.events) {
            const quantityBefore = quantity;
            quantity += event.delta;
            const reference = event.order || event.purchase || event.transfer;
            transactionDocs.push({
                product: row.product._id,
                warehouse: row.warehouse._id,
                type: event.type,
                quantity: Math.abs(event.delta),
                quantityBefore,
                quantityAfter: quantity,
                referenceType: event.referenceType,
                referenceId: reference ? reference._id : undefined,
                note: event.note,
                performedBy: event.user,
                createdAt: event.date
            });
        }
        if (quantity !== row.quantity) {
            throw new Error(`Stock history of ${row.product.sku} in ${row.warehouse.code} does not add up`);
        }
        const firstDate = row.events[0]?.date || daysAgo(375);
        const lastDate = row.events.at(-1)?.date || firstDate;
        inventoryDocs.push({
            _id: inventoryId,
            product: row.product._id,
            warehouse: row.warehouse._id,
            quantity: row.quantity,
            reservedQuantity: row.reserved,
            reorderLevel: row.reorderLevel,
            createdAt: firstDate,
            updatedAt: lastDate
        });
    }
    await insertWithDates(Inventory, inventoryDocs);
    await insertWithDates(StockTransaction, transactionDocs);
    return transactionDocs;
};

// ---------- 8. Notifications and counters ----------

const saveNotifications = async (rows, users) => {
    const recipients = [users.admin, users.ravi, users.kavya, users.arjun];
    const lowRows = rows.filter((row) => row.quantity - row.reserved < row.reorderLevel).slice(0, 8);
    const docs = [];
    lowRows.forEach((row, index) => {
        const available = row.quantity - row.reserved;
        for (const user of recipients) {
            docs.push({
                recipient: user._id,
                type: "LOW_STOCK",
                title: available <= 0 ? "Out of stock" : "Low stock",
                message: `${row.product.name} (${row.product.sku}) has ${available} available in ${row.warehouse.code} — reorder level is ${row.reorderLevel}`,
                link: "/inventory",
                isRead: index >= 4,
                readAt: index >= 4 ? daysAgo(index) : undefined,
                createdAt: daysAgo(index * 2 + 1),
                updatedAt: daysAgo(index * 2 + 1)
            });
        }
    });
    await insertWithDates(Notification, docs);
    return docs.length;
};

const saveCounters = async (orders, purchases, transfers) => {
    // The next record created in the app continues the numbering (ORD-000051, PO-000026, TRF-000021)
    await Counter.insertMany([
        { _id: "order", seq: orders.length },
        { _id: "purchase", seq: purchases.length },
        { _id: "transfer", seq: transfers.length }
    ]);
};

// ---------- Run ----------

const seedDemo = async () => {
    try {
        checkEnvironment();
        await connectDB();
        console.log(`Seeding demo data into "${mongoose.connection.name}" (business data will be replaced)…`);

        await clearBusinessData();
        const users = await ensureUsers();
        const { categories, products, warehouses, suppliers } = await createCatalog(users);
        const activeWarehouses = warehouses.filter((warehouse) => warehouse.status === "ACTIVE");

        const rows = planInventory(products, activeWarehouses);
        const orders = buildOrders(rows, activeWarehouses, users);
        const purchases = buildPurchases(rows, suppliers, users);
        const transfers = buildTransfers(rows, users);
        addAdjustments(rows, users);
        settleStock(rows, users);

        await saveOrders(orders);
        await savePurchases(purchases);
        await saveTransfers(transfers);
        const transactions = await saveStock(rows);
        const notificationCount = await saveNotifications(rows, users);
        await saveCounters(orders, purchases, transfers);

        const count = (list, key, value) => list.filter((item) => item[key] === value).length;
        const statusCount = {};
        rows.forEach((row) => {
            statusCount[row.targetStatus] = (statusCount[row.targetStatus] || 0) + 1;
        });
        console.log(`Categories: ${categories.length}`);
        console.log(`Products: ${products.length} (${count(products, "status", "INACTIVE")} inactive)`);
        console.log(`Warehouses: ${warehouses.length} (${warehouses.length - activeWarehouses.length} inactive)`);
        console.log(`Stock records: ${rows.length} — ${Object.entries(statusCount).map(([key, value]) => `${key} ${value}`).join(", ")}`);
        console.log(`Suppliers: ${suppliers.length} (${count(suppliers, "status", "INACTIVE")} inactive)`);
        console.log(`Customers: ${demo.CUSTOMERS.length}, orders: ${orders.length}`);
        console.log(`Purchase orders: ${purchases.length}, transfers: ${transfers.length}`);
        console.log(`Stock history lines: ${transactions.length} (${count(transactions, "type", "ADJUSTMENT")} adjustments)`);
        console.log(`Notifications: ${notificationCount}`);
        for (const warehouse of activeWarehouses) {
            const units = rows.filter((row) => row.warehouse === warehouse).reduce((sum, row) => sum + row.quantity, 0);
            console.log(`  ${warehouse.code}: ${units} / ${warehouse.capacity} units`);
        }
        console.log("Done. Log in with your admin account, or e.g. ravi@shop.com / Ravi67890 (manager), sunita@shop.com / Staff1234 (staff).");
    }
    catch (error) {
        console.error("Seeding failed:", error.message);
        process.exitCode = 1;
    }
    finally {
        await mongoose.disconnect();
    }
};

seedDemo();

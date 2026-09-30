const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Warehouse = require("../models/Warehouse");
const Supplier = require("../models/Supplier");
const Inventory = require("../models/Inventory");
const StockTransaction = require("../models/StockTransaction");
const Order = require("../models/Order");
const PurchaseOrder = require("../models/PurchaseOrder");
const roundMoney = require("../utils/roundMoney");
const { REPORT_UTC_OFFSET, resolveRange } = require("../utils/reportDates");
const {
    RECORD_STATUS,
    ORDER_STATUS,
    OPEN_ORDER_STATUSES,
    PURCHASE_STATUS,
    STOCK_TRANSACTION_TYPE
} = require("../utils/constants");
const { LOW_STOCK_CONDITION } = require("./inventoryService");

// ---------- Report definitions (what each number means) ----------

// Orders that count as sales: confirmed or further, not cancelled
const SALES_ORDER_STATUSES = [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.PACKED,
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.DELIVERED
];

// Orders whose goods actually left the warehouse (used for "units sold")
const SOLD_ORDER_STATUSES = [ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED];

// Purchases still in progress (drafts are not counted)
const PENDING_PURCHASE_STATUSES = [
    PURCHASE_STATUS.PENDING,
    PURCHASE_STATUS.APPROVED,
    PURCHASE_STATUS.ORDERED,
    PURCHASE_STATUS.PARTIALLY_RECEIVED
];

// POs actually sent to the supplier and not cancelled
const SENT_PURCHASE_STATUSES = [
    PURCHASE_STATUS.ORDERED,
    PURCHASE_STATUS.PARTIALLY_RECEIVED,
    PURCHASE_STATUS.RECEIVED
];

// Real purchasing activity per month (not drafts, rejected or cancelled)
const PURCHASE_TREND_STATUSES = [PURCHASE_STATUS.PENDING, PURCHASE_STATUS.APPROVED, ...SENT_PURCHASE_STATUSES];

// ---------- Small helpers ----------

// IMPORTANT: aggregate() does NOT convert strings to ObjectIds like find() does.
// { $match: { warehouse: "665f..." } } would silently match nothing.
const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// "Which month (in the business's time zone) does this date belong to?" → "2026-09"
const monthOf = (dateField) => ({
    $dateToString: { format: "%Y-%m", date: dateField, timezone: REPORT_UTC_OFFSET }
});

// Charts need every month, even months with no data (otherwise the line skips them)
const fillMonths = (monthKeys, rowsByMonth, emptyRow) => {
    return monthKeys.map((month) => ({ month, ...emptyRow, ...(rowsByMonth[month] || {}) }));
};

const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// ================================================================
// 1. INVENTORY REPORT — per product, across all (or one) warehouse(s)
// ================================================================
const getInventoryReport = async ({ warehouse, category } = {}) => {
    const pipeline = [];

    if (warehouse) {
        pipeline.push({ $match: { warehouse: toObjectId(warehouse) } });           // only this warehouse's rows
    }
    pipeline.push(
        {
            $group: {                                                                // one bucket per product
                _id: "$product",
                quantity: { $sum: "$quantity" },
                reservedQuantity: { $sum: "$reservedQuantity" },
                warehouseCount: { $sum: 1 }
            }
        },
        { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },  // bring in the product
        { $unwind: "$product" }                                                      // [product] → product
    );
    if (category) {
        pipeline.push({ $match: { "product.category": toObjectId(category) } });   // only this category
    }
    pipeline.push(
        { $lookup: { from: "categories", localField: "product.category", foreignField: "_id", as: "category" } },
        { $unwind: "$category" },
        {
            $project: {                                                              // shape each row
                _id: 0,
                productId: "$_id",
                name: "$product.name",
                sku: "$product.sku",
                category: "$category.name",
                quantity: 1,
                reservedQuantity: 1,
                availableQuantity: { $subtract: ["$quantity", "$reservedQuantity"] },
                costPrice: "$product.costPrice",
                stockValue: { $round: [{ $multiply: ["$quantity", "$product.costPrice"] }, 2] },
                warehouseCount: 1
            }
        },
        { $sort: { stockValue: -1 } }                                                // most valuable first
    );

    const rows = await Inventory.aggregate(pipeline);

    // Totals of a few hundred product rows: a simple loop is clearest
    const summary = { productCount: rows.length, totalQuantity: 0, totalReserved: 0, totalAvailable: 0, totalStockValue: 0 };
    for (const row of rows) {
        summary.totalQuantity += row.quantity;
        summary.totalReserved += row.reservedQuantity;
        summary.totalAvailable += row.availableQuantity;
        summary.totalStockValue += row.stockValue;
    }
    summary.totalStockValue = roundMoney(summary.totalStockValue);

    return { summary, rows };
};

// ================================================================
// 2. WAREHOUSE REPORT — stock, capacity use and value per warehouse
// ================================================================
const getWarehouseReport = async () => {
    const [warehouses, totals] = await Promise.all([
        Warehouse.find().populate("manager", "name").sort({ code: 1 }),
        Inventory.aggregate([
            { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
            { $unwind: "$product" },
            {
                $group: {                                                            // one bucket per warehouse
                    _id: "$warehouse",
                    totalQuantity: { $sum: "$quantity" },
                    reservedQuantity: { $sum: "$reservedQuantity" },
                    // count only products that actually have stock here
                    productCount: { $sum: { $cond: [{ $gt: ["$quantity", 0] }, 1, 0] } },
                    stockValue: { $sum: { $multiply: ["$quantity", "$product.costPrice"] } }
                }
            }
        ])
    ]);

    // Merge in JavaScript so warehouses with NO stock still appear (with zeros)
    const totalsById = {};
    for (const total of totals) {
        totalsById[total._id.toString()] = total;
    }

    const rows = warehouses.map((warehouse) => {
        const total = totalsById[warehouse._id.toString()] || { totalQuantity: 0, reservedQuantity: 0, productCount: 0, stockValue: 0 };
        return {
            warehouseId: warehouse._id,
            code: warehouse.code,
            name: warehouse.name,
            city: warehouse.city,
            status: warehouse.status,
            manager: warehouse.manager ? warehouse.manager.name : null,
            capacity: warehouse.capacity,
            totalQuantity: total.totalQuantity,
            reservedQuantity: total.reservedQuantity,
            availableQuantity: total.totalQuantity - total.reservedQuantity,
            productCount: total.productCount,
            utilizationPercent: percent(total.totalQuantity, warehouse.capacity),
            stockValue: roundMoney(total.stockValue)
        };
    });

    const summary = { warehouseCount: rows.length, totalCapacity: 0, totalQuantity: 0, totalStockValue: 0 };
    for (const row of rows) {
        summary.totalCapacity += row.capacity;
        summary.totalQuantity += row.totalQuantity;
        summary.totalStockValue += row.stockValue;
    }
    summary.totalStockValue = roundMoney(summary.totalStockValue);
    summary.overallUtilizationPercent = percent(summary.totalQuantity, summary.totalCapacity);

    return { summary, rows };
};

// ================================================================
// 3. STOCK MOVEMENT REPORT — totals per type + per month
// ================================================================
const getStockMovementReport = async ({ from, to, warehouse, product } = {}) => {
    const range = resolveRange({ from, to });

    const match = { createdAt: { $gte: range.start, $lte: range.end } };
    if (warehouse) match.warehouse = toObjectId(warehouse);
    if (product) match.product = toObjectId(product);

    const groups = await StockTransaction.aggregate([
        { $match: match },
        {
            $group: {                                                                // one bucket per (month, type)
                _id: { month: monthOf("$createdAt"), type: "$type" },
                quantity: { $sum: "$quantity" },
                count: { $sum: 1 }
            }
        }
    ]);

    // Every type appears, even with 0
    const types = Object.values(STOCK_TRANSACTION_TYPE);
    const totals = {};
    const emptyMonth = {};
    for (const type of types) {
        totals[type] = { quantity: 0, count: 0 };
        emptyMonth[type] = 0;
    }

    // Turn [{ _id: { month, type }, quantity }] into { "2026-09": { STOCK_IN: 40, ... } }
    const byMonthMap = {};
    for (const group of groups) {
        const { month, type } = group._id;
        totals[type].quantity += group.quantity;
        totals[type].count += group.count;
        byMonthMap[month] = byMonthMap[month] || {};
        byMonthMap[month][type] = group.quantity;
    }

    return {
        range: { from: range.from, to: range.to },
        totals,
        byMonth: fillMonths(range.months, byMonthMap, emptyMonth)
    };
};

// ================================================================
// 4. ORDERS REPORT — summary, by status, by month
// ================================================================
const getOrdersReport = async ({ from, to, warehouse } = {}) => {
    const range = resolveRange({ from, to });

    const match = { createdAt: { $gte: range.start, $lte: range.end } };
    if (warehouse) match.warehouse = toObjectId(warehouse);

    const [statusGroups, monthGroups] = await Promise.all([
        Order.aggregate([
            { $match: match },
            { $group: { _id: "$status", count: { $sum: 1 }, totalAmount: { $sum: "$totalAmount" } } }
        ]),
        Order.aggregate([
            { $match: { ...match, status: { $in: SALES_ORDER_STATUSES } } },          // only real sales
            { $group: { _id: monthOf("$createdAt"), orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } }
        ])
    ]);

    // Every status appears, even with 0 (for the "order status distribution" chart)
    const byStatus = Object.values(ORDER_STATUS).map((status) => {
        const group = statusGroups.find((item) => item._id === status);
        return { status, count: group ? group.count : 0, totalAmount: group ? roundMoney(group.totalAmount) : 0 };
    });

    const summary = { totalOrders: 0, salesOrders: 0, cancelledOrders: 0, completedOrders: 0, revenue: 0 };
    for (const row of byStatus) {
        summary.totalOrders += row.count;
        if (SALES_ORDER_STATUSES.includes(row.status)) {
            summary.salesOrders += row.count;
            summary.revenue += row.totalAmount;
        }
        if (row.status === ORDER_STATUS.CANCELLED) summary.cancelledOrders = row.count;
        if (row.status === ORDER_STATUS.DELIVERED) summary.completedOrders = row.count;
    }
    summary.revenue = roundMoney(summary.revenue);
    summary.averageOrderValue = summary.salesOrders > 0 ? roundMoney(summary.revenue / summary.salesOrders) : 0;

    const byMonthMap = {};
    for (const group of monthGroups) {
        byMonthMap[group._id] = { orders: group.orders, revenue: roundMoney(group.revenue) };
    }

    return {
        range: { from: range.from, to: range.to },
        summary,
        byStatus,
        byMonth: fillMonths(range.months, byMonthMap, { orders: 0, revenue: 0 })
    };
};

// ================================================================
// 5. PURCHASES REPORT — summary, by status, by month
// ================================================================
const getPurchasesReport = async ({ from, to, supplier } = {}) => {
    const range = resolveRange({ from, to });

    const match = { createdAt: { $gte: range.start, $lte: range.end } };
    if (supplier) match.supplier = toObjectId(supplier);

    const [statusGroups, monthGroups, receivedGroups] = await Promise.all([
        PurchaseOrder.aggregate([
            { $match: match },
            { $group: { _id: "$status", count: { $sum: 1 }, totalAmount: { $sum: "$totalAmount" } } }
        ]),
        PurchaseOrder.aggregate([
            { $match: { ...match, status: { $in: PURCHASE_TREND_STATUSES } } },
            { $group: { _id: monthOf("$createdAt"), purchaseOrders: { $sum: 1 }, value: { $sum: "$totalAmount" } } }
        ]),
        // Value of goods actually received: one row per PO item, then sum received × cost
        PurchaseOrder.aggregate([
            { $match: match },
            { $unwind: "$items" },                                                   // one document per item line
            {
                $group: {
                    _id: null,                                                       // null = one bucket for everything
                    receivedValue: { $sum: { $multiply: ["$items.quantityReceived", "$items.unitCost"] } }
                }
            }
        ])
    ]);

    const byStatus = Object.values(PURCHASE_STATUS).map((status) => {
        const group = statusGroups.find((item) => item._id === status);
        return { status, count: group ? group.count : 0, totalAmount: group ? roundMoney(group.totalAmount) : 0 };
    });

    const summary = { totalPurchaseOrders: 0, openPurchaseOrders: 0, orderedValue: 0 };
    for (const row of byStatus) {
        summary.totalPurchaseOrders += row.count;
        if (PENDING_PURCHASE_STATUSES.includes(row.status)) summary.openPurchaseOrders += row.count;
        if (SENT_PURCHASE_STATUSES.includes(row.status)) summary.orderedValue += row.totalAmount;
    }
    summary.orderedValue = roundMoney(summary.orderedValue);
    summary.receivedValue = receivedGroups.length > 0 ? roundMoney(receivedGroups[0].receivedValue) : 0;

    const byMonthMap = {};
    for (const group of monthGroups) {
        byMonthMap[group._id] = { purchaseOrders: group.purchaseOrders, value: roundMoney(group.value) };
    }

    return {
        range: { from: range.from, to: range.to },
        summary,
        byStatus,
        byMonth: fillMonths(range.months, byMonthMap, { purchaseOrders: 0, value: 0 })
    };
};

// ================================================================
// 6. SUPPLIER REPORT — how much we bought and how reliably they delivered
// ================================================================
const getSupplierReport = async ({ from, to } = {}) => {
    const range = resolveRange({ from, to });

    const [suppliers, performance, openGroups] = await Promise.all([
        Supplier.find().sort({ name: 1 }),
        PurchaseOrder.aggregate([
            {
                $match: {                                                            // POs sent to them, not cancelled
                    createdAt: { $gte: range.start, $lte: range.end },
                    status: { $in: SENT_PURCHASE_STATUSES }
                }
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$supplier",
                    purchaseOrderIds: { $addToSet: "$_id" },                         // each PO counted once
                    unitsOrdered: { $sum: "$items.quantityOrdered" },
                    unitsReceived: { $sum: "$items.quantityReceived" },
                    orderedValue: { $sum: { $multiply: ["$items.quantityOrdered", "$items.unitCost"] } },
                    receivedValue: { $sum: { $multiply: ["$items.quantityReceived", "$items.unitCost"] } }
                }
            }
        ]),
        // Open right now (not limited to the date range)
        PurchaseOrder.aggregate([
            { $match: { status: { $in: [PURCHASE_STATUS.ORDERED, PURCHASE_STATUS.PARTIALLY_RECEIVED] } } },
            { $group: { _id: "$supplier", count: { $sum: 1 } } }
        ])
    ]);

    const performanceById = {};
    for (const item of performance) performanceById[item._id.toString()] = item;
    const openById = {};
    for (const item of openGroups) openById[item._id.toString()] = item.count;

    // Every supplier appears, even ones we haven't bought from
    const rows = suppliers.map((supplier) => {
        const id = supplier._id.toString();
        const stats = performanceById[id];
        return {
            supplierId: supplier._id,
            name: supplier.name,
            status: supplier.status,
            purchaseOrders: stats ? stats.purchaseOrderIds.length : 0,
            unitsOrdered: stats ? stats.unitsOrdered : 0,
            unitsReceived: stats ? stats.unitsReceived : 0,
            orderedValue: stats ? roundMoney(stats.orderedValue) : 0,
            receivedValue: stats ? roundMoney(stats.receivedValue) : 0,
            // null = "no data" (different from 0% = "delivered nothing")
            fulfilmentRatePercent: stats ? percent(stats.unitsReceived, stats.unitsOrdered) : null,
            openPurchaseOrders: openById[id] || 0
        };
    });

    return { range: { from: range.from, to: range.to }, rows };
};

// ================================================================
// 7. LOW-STOCK REPORT — what is short, and what is already on order
// ================================================================
const getLowStockReport = async ({ warehouse } = {}) => {
    const match = { $expr: LOW_STOCK_CONDITION };                                   // same definition as alerts
    if (warehouse) match.warehouse = toObjectId(warehouse);

    const [lowRows, onOrderGroups] = await Promise.all([
        Inventory.aggregate([
            { $match: match },
            { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
            { $unwind: "$product" },
            { $lookup: { from: "warehouses", localField: "warehouse", foreignField: "_id", as: "warehouse" } },
            { $unwind: "$warehouse" },
            {
                $project: {
                    _id: 0,
                    inventoryId: "$_id",
                    productId: "$product._id",
                    warehouseId: "$warehouse._id",
                    product: { name: "$product.name", sku: "$product.sku" },
                    warehouse: { code: "$warehouse.code", name: "$warehouse.name" },
                    quantity: 1,
                    reservedQuantity: 1,
                    availableQuantity: { $subtract: ["$quantity", "$reservedQuantity"] },
                    reorderLevel: 1,
                    shortage: { $subtract: ["$reorderLevel", { $subtract: ["$quantity", "$reservedQuantity"] }] }
                }
            },
            { $sort: { shortage: -1 } }                                              // worst first
        ]),
        // Units still outstanding on open purchase orders, per product + warehouse
        PurchaseOrder.aggregate([
            { $match: { status: { $in: PENDING_PURCHASE_STATUSES } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: { product: "$items.product", warehouse: "$warehouse" },
                    onOrderQuantity: { $sum: { $subtract: ["$items.quantityOrdered", "$items.quantityReceived"] } }
                }
            }
        ])
    ]);

    const onOrderByKey = {};
    for (const group of onOrderGroups) {
        onOrderByKey[`${group._id.product}-${group._id.warehouse}`] = group.onOrderQuantity;
    }

    const rows = lowRows.map((row) => ({
        ...row,
        onOrderQuantity: onOrderByKey[`${row.productId}-${row.warehouseId}`] || 0
    }));

    let totalShortage = 0;
    for (const row of rows) totalShortage += row.shortage;

    return { summary: { itemCount: rows.length, totalShortage }, rows };
};

// ================================================================
// 8. PRODUCT PERFORMANCE — best sellers (goods that actually shipped)
// ================================================================
const getProductPerformance = async ({ from, to, warehouse, sortBy = "units", limit = 10 } = {}) => {
    const range = resolveRange({ from, to });

    const match = { status: { $in: SOLD_ORDER_STATUSES }, createdAt: { $gte: range.start, $lte: range.end } };
    if (warehouse) match.warehouse = toObjectId(warehouse);

    const sort = sortBy === "revenue" ? { revenue: -1, unitsSold: -1 } : { unitsSold: -1, revenue: -1 };

    const rows = await Order.aggregate([
        { $match: match },                                                           // shipped/delivered orders in range
        { $lookup: { from: "orderItems", localField: "_id", foreignField: "order", as: "items" } },  // their lines
        { $unwind: "$items" },                                                       // one document per line
        {
            $group: {                                                                // one bucket per product
                _id: "$items.product",
                // name/sku as they were when sold (the order line keeps a snapshot)
                name: { $first: "$items.productName" },
                sku: { $first: "$items.sku" },
                unitsSold: { $sum: "$items.quantity" },
                revenue: { $sum: "$items.lineTotal" },
                orderIds: { $addToSet: "$_id" }
            }
        },
        {
            $project: {
                _id: 0,
                productId: "$_id",
                name: 1,
                sku: 1,
                unitsSold: 1,
                revenue: { $round: ["$revenue", 2] },
                orderCount: { $size: "$orderIds" }
            }
        },
        { $sort: sort },
        { $limit: limit }
    ]);

    return { range: { from: range.from, to: range.to }, sortBy, rows };
};

// ================================================================
// DASHBOARD — the spec's 10 KPIs (current state) + 6 charts (last 6 months)
// ================================================================
// Stock value of everything on hand = Σ (quantity × the product's current cost price)
const getTotalStockValue = async () => {
    const result = await Inventory.aggregate([
        { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
        { $unwind: "$product" },
        { $group: { _id: null, value: { $sum: { $multiply: ["$quantity", "$product.costPrice"] } } } }
    ]);
    return result.length > 0 ? roundMoney(result[0].value) : 0;
};

// Active products with NOTHING available in any warehouse (including products never stocked)
const countOutOfStockProducts = async () => {
    const result = await Product.aggregate([
        { $match: { status: RECORD_STATUS.ACTIVE } },
        { $lookup: { from: "inventories", localField: "_id", foreignField: "product", as: "stock" } },
        { $project: { available: { $sum: { $map: { input: "$stock", as: "row", in: { $subtract: ["$$row.quantity", "$$row.reservedQuantity"] } } } } } },
        { $match: { available: { $lte: 0 } } },
        { $count: "total" }
    ]);
    return result.length > 0 ? result[0].total : 0;
};

// Customers are grouped from orders the same way as the Customers page (email, else name + phone)
const countCustomers = async () => {
    const result = await Order.aggregate([
        { $group: { _id: { $ifNull: ["$customer.email", { $concat: ["$customer.name", "|", { $ifNull: ["$customer.phone", ""] }] }] } } },
        { $count: "total" }
    ]);
    return result.length > 0 ? result[0].total : 0;
};

const getDashboard = async () => {
    const [
        totalProducts,
        totalCategories,
        totalWarehouses,
        totalSuppliers,
        inventoryTotals,
        totalOrders,
        pendingOrders,
        completedOrders,
        lowStockProductIds,
        pendingPurchases,
        stockValue,
        outOfStockProducts,
        totalCustomers,
        unconfirmedOrders
    ] = await Promise.all([
        Product.countDocuments({ status: RECORD_STATUS.ACTIVE }),
        Category.countDocuments({ status: RECORD_STATUS.ACTIVE }),
        Warehouse.countDocuments({ status: RECORD_STATUS.ACTIVE }),
        Supplier.countDocuments({ status: RECORD_STATUS.ACTIVE }),
        Inventory.aggregate([{ $group: { _id: null, units: { $sum: "$quantity" } } }]),
        Order.countDocuments({ status: { $ne: ORDER_STATUS.CANCELLED } }),
        Order.countDocuments({ status: { $in: OPEN_ORDER_STATUSES } }),
        Order.countDocuments({ status: ORDER_STATUS.DELIVERED }),
        // distinct: a product low in two warehouses counts once
        Inventory.distinct("product", { $expr: LOW_STOCK_CONDITION }),
        PurchaseOrder.countDocuments({ status: { $in: PENDING_PURCHASE_STATUSES } }),
        getTotalStockValue(),
        countOutOfStockProducts(),
        countCustomers(),
        // Orders still waiting to be confirmed (no stock reserved yet)
        Order.countDocuments({ status: ORDER_STATUS.PENDING })
    ]);

    const kpis = {
        totalProducts,
        totalCategories,
        totalWarehouses,
        totalInventory: inventoryTotals.length > 0 ? inventoryTotals[0].units : 0,
        totalOrders,
        pendingOrders,
        completedOrders,
        lowStockProducts: lowStockProductIds.length,
        totalSuppliers,
        pendingPurchases,
        stockValue,
        outOfStockProducts,
        totalCustomers,
        unconfirmedOrders
    };

    // Charts reuse the reports above (default range: last 6 months)
    const [ordersReport, warehouseReport, topProducts, stockMovement, purchasesReport] = await Promise.all([
        getOrdersReport(),
        getWarehouseReport(),
        getProductPerformance({ limit: 5 }),
        getStockMovementReport(),
        getPurchasesReport()
    ]);

    const charts = {
        ordersByMonth: ordersReport.byMonth,
        inventoryByWarehouse: warehouseReport.rows
            .filter((row) => row.status === RECORD_STATUS.ACTIVE)
            .map((row) => ({ code: row.code, name: row.name, quantity: row.totalQuantity, utilizationPercent: row.utilizationPercent })),
        topProducts: topProducts.rows,
        stockMovement: stockMovement.byMonth,
        purchaseTrends: purchasesReport.byMonth,
        orderStatusDistribution: ordersReport.byStatus.map((row) => ({ status: row.status, count: row.count }))
    };

    return { kpis, charts, range: ordersReport.range };
};

module.exports = {
    getDashboard,
    getInventoryReport,
    getWarehouseReport,
    getStockMovementReport,
    getOrdersReport,
    getPurchasesReport,
    getSupplierReport,
    getLowStockReport,
    getProductPerformance
};

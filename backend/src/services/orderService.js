const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Inventory = require("../models/Inventory");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const moveStatus = require("../utils/moveStatus");
const roundMoney = require("../utils/roundMoney");
const {
    ROLES,
    ORDER_STATUS,
    RESERVING_ORDER_STATUSES,
    CANCELLABLE_ORDER_STATUSES,
    NOTIFICATION_TYPE
} = require("../utils/constants");
const { findActiveProduct, findActiveWarehouse, reserveStock, releaseStock } = require("./inventoryService");
const { getNextCode } = require("./counterService");
const { logAction } = require("./auditService");
const { notifyRoles, notifyUser } = require("./notificationService");

// Who is told about newly confirmed orders (the people who pick and pack them)
const NEW_ORDER_ROLES = [ROLES.ADMIN, ROLES.STAFF];

// ---------- Pure helpers (no database; unit-tested) ----------

// One order line: price × quantity, plus tax as a percentage
const calculateLine = ({ unitPrice, taxRate, quantity }) => {
    const lineSubtotal = roundMoney(unitPrice * quantity);
    const lineTax = roundMoney((lineSubtotal * taxRate) / 100);
    return {
        lineSubtotal,
        lineTax,
        lineTotal: roundMoney(lineSubtotal + lineTax)
    };
};

// Order totals are the sums of the lines
const calculateOrderTotals = (lines) => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const line of lines) {
        subtotal += line.lineSubtotal;
        taxAmount += line.lineTax;
    }
    subtotal = roundMoney(subtotal);
    taxAmount = roundMoney(taxAmount);
    return { subtotal, taxAmount, totalAmount: roundMoney(subtotal + taxAmount) };
};

// ---------- Helpers ----------

const findOrderOrFail = async (orderId) => {
    const order = await Order.findById(orderId);
    if (!order) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    return order;
};

const populateOrder = (order) => {
    return order.populate([
        { path: "warehouse", select: "name code" },
        { path: "createdBy", select: "name" },
        { path: "statusHistory.changedBy", select: "name" }
    ]);
};

// The order plus its lines (they live in the separate orderItems collection)
const getOrderWithItems = async (order) => {
    await populateOrder(order);
    const items = await OrderItem.find({ order: order._id }).sort({ createdAt: 1 });
    return { order, items };
};

// Checks every product, checks there is enough available stock right now (early
// feedback — nothing is held yet), and copies the current price and tax (price snapshot).
const buildOrderLines = async (items, warehouse) => {
    const lines = [];
    for (const item of items) {
        const product = await findActiveProduct(item.product);

        const inventory = await Inventory.findOne({ product: product._id, warehouse: warehouse._id });
        const available = inventory ? inventory.availableQuantity : 0;
        if (available < item.quantity) {
            throw new AppError(
                400,
                "INSUFFICIENT_STOCK",
                `Insufficient stock of ${product.sku} in ${warehouse.code}: ${available} available, ${item.quantity} requested`
            );
        }

        const line = {
            product: product._id,
            productName: product.name,
            sku: product.sku,
            unitPrice: product.sellingPrice,
            taxRate: product.taxRate,
            quantity: item.quantity
        };
        lines.push({ ...line, ...calculateLine(line) });
    }
    return lines;
};

// Reserve every line, or none: if one line fails, the lines already
// reserved are released again (compensation, because we have no transactions)
const reserveOrderLines = async (order, items) => {
    const reservedLines = [];
    try {
        for (const item of items) {
            await reserveStock({ productId: item.product, warehouseId: order.warehouse, quantity: item.quantity });
            reservedLines.push(item);
        }
    }
    catch (error) {
        await releaseOrderLines(order, reservedLines);
        throw error;
    }
};

const releaseOrderLines = async (order, items) => {
    for (const item of items) {
        await releaseStock({ productId: item.product, warehouseId: order.warehouse, quantity: item.quantity });
    }
};

// One entry in the order's tracking timeline
const historyEntry = (status, userId, note) => ({ status, changedBy: userId, changedAt: new Date(), note });

const orderLink = (order) => `/orders/${order._id}`;

// ---------- Reads ----------

// GET /api/orders
const getOrders = async ({ status, warehouse, search, from, to, page, limit }) => {
    const filter = {};
    if (status) filter.status = status;
    if (warehouse) filter.warehouse = warehouse;
    if (search) {
        const searchPattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [
            { orderNumber: searchPattern },
            { "customer.name": searchPattern },
            { "customer.phone": searchPattern }
        ];
    }
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate("warehouse", "name code")
            .populate("createdBy", "name")
            .select("-statusHistory")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Order.countDocuments(filter)
    ]);

    return {
        orders,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// GET /api/orders/:id
const getOrderById = async (orderId) => {
    const order = await findOrderOrFail(orderId);
    return getOrderWithItems(order);
};

// ---------- Create and edit (PENDING) ----------

// POST /api/orders → PENDING (or straight to CONFIRMED with confirm: true)
const createOrder = async (data, currentUser) => {
    const warehouse = await findActiveWarehouse(data.warehouse);
    const lines = await buildOrderLines(data.items, warehouse);

    const order = await Order.create({
        orderNumber: await getNextCode("order", "ORD"),
        customer: data.customer,
        warehouse: warehouse._id,
        notes: data.notes,
        ...calculateOrderTotals(lines),
        statusHistory: [historyEntry(ORDER_STATUS.PENDING, currentUser._id, "Order created")],
        createdBy: currentUser._id
    });

    try {
        await OrderItem.insertMany(lines.map((line) => ({ ...line, order: order._id })));
    }
    catch (error) {
        // Don't leave an order without its lines
        await Order.deleteOne({ _id: order._id });
        throw error;
    }

    await logAction({
        userId: currentUser._id,
        action: "ORDER_CREATED",
        entityType: "Order",
        entityId: order._id,
        newValue: { status: order.status, totalAmount: order.totalAmount, lines: lines.length },
        metadata: { orderNumber: order.orderNumber, customer: order.customer.name }
    });

    if (data.confirm) {
        return confirmOrder(order._id, currentUser);
    }
    return getOrderWithItems(order);
};

// PUT /api/orders/:id — only while PENDING
const updateOrder = async (orderId, updates, currentUser) => {
    const order = await findOrderOrFail(orderId);
    if (order.status !== ORDER_STATUS.PENDING) {
        throw new AppError(409, "INVALID_ORDER_STATUS", `Order ${order.orderNumber} is ${order.status}; only PENDING orders can be edited`);
    }

    const changes = {};
    if (updates.customer) changes.customer = updates.customer;
    if (updates.notes !== undefined) changes.notes = updates.notes;

    const warehouse = updates.warehouse
        ? await findActiveWarehouse(updates.warehouse)
        : await findActiveWarehouse(order.warehouse);
    if (updates.warehouse) changes.warehouse = warehouse._id;

    // New items, or a new warehouse (stock must be re-checked there), rebuild the lines
    let newLines = null;
    if (updates.items || updates.warehouse) {
        const itemsToBuild = updates.items
            || (await OrderItem.find({ order: order._id })).map((item) => ({ product: item.product, quantity: item.quantity }));
        newLines = await buildOrderLines(itemsToBuild, warehouse);
        Object.assign(changes, calculateOrderTotals(newLines));
    }

    // Save only if it is STILL pending (someone may have confirmed it meanwhile)
    const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: ORDER_STATUS.PENDING },
        { $set: changes },
        { returnDocument: "after" }
    );
    if (!updated) {
        throw new AppError(409, "INVALID_ORDER_STATUS", `Order ${order.orderNumber} is no longer PENDING`);
    }

    if (newLines) {
        await OrderItem.deleteMany({ order: order._id });
        await OrderItem.insertMany(newLines.map((line) => ({ ...line, order: order._id })));
    }

    await logAction({
        userId: currentUser._id,
        action: "ORDER_UPDATED",
        entityType: "Order",
        entityId: order._id,
        oldValue: { totalAmount: order.totalAmount },
        newValue: { totalAmount: updated.totalAmount },
        metadata: { orderNumber: order.orderNumber, changedFields: Object.keys(updates) }
    });

    return getOrderWithItems(updated);
};

// ---------- Confirm (reserve stock) ----------

// PUT /api/orders/:id/confirm  PENDING → CONFIRMED, reserve every line (Rules 2 + 4)
const confirmOrder = async (orderId, currentUser) => {
    const order = await findOrderOrFail(orderId);
    await findActiveWarehouse(order.warehouse);
    const items = await OrderItem.find({ order: order._id });
    for (const item of items) {
        await findActiveProduct(item.product);
    }

    // 1. Claim the order (atomic) so a double-click can't reserve twice
    const confirmed = await moveStatus(
        Order,
        order._id,
        [ORDER_STATUS.PENDING],
        ORDER_STATUS.CONFIRMED,
        {},
        { statusHistory: historyEntry(ORDER_STATUS.CONFIRMED, currentUser._id, "Stock reserved") }
    );
    if (!confirmed) {
        const current = await findOrderOrFail(orderId);
        throw new AppError(409, "INVALID_ORDER_STATUS", `Order ${current.orderNumber} is ${current.status}; it must be PENDING to confirm it`);
    }

    // 2. Reserve all lines, or none
    try {
        await reserveOrderLines(confirmed, items);
    }
    catch (error) {
        // 3. Put the order back to PENDING and remove the "CONFIRMED" history entry
        await Order.updateOne(
            { _id: confirmed._id },
            { $set: { status: ORDER_STATUS.PENDING }, $pop: { statusHistory: 1 } }
        );
        throw error;
    }

    await logAction({
        userId: currentUser._id,
        action: "ORDER_CONFIRMED",
        entityType: "Order",
        entityId: confirmed._id,
        oldValue: { status: ORDER_STATUS.PENDING },
        newValue: { status: confirmed.status },
        metadata: { orderNumber: confirmed.orderNumber, reserved: items.map((item) => ({ sku: item.sku, quantity: item.quantity })) }
    });

    await notifyRoles(NEW_ORDER_ROLES, {
        type: NOTIFICATION_TYPE.NEW_ORDER,
        title: "New order",
        message: `${confirmed.orderNumber} for ${confirmed.customer.name}: ${items.length} item(s), total ${confirmed.totalAmount}. Ready to process.`,
        link: orderLink(confirmed)
    }, currentUser._id);

    return getOrderWithItems(confirmed);
};

// ---------- Cancel (release stock) ----------

// DELETE /api/orders/:id — cancel before shipping; reserved stock is released
const cancelOrder = async (orderId, reason, currentUser) => {
    const before = await findOrderOrFail(orderId);
    if (!CANCELLABLE_ORDER_STATUSES.includes(before.status)) {
        throw new AppError(
            409,
            "INVALID_ORDER_STATUS",
            `Order ${before.orderNumber} is ${before.status}; it can only be cancelled before it is shipped`
        );
    }

    // Allowed "from" is exactly the status we just read, so we know for sure
    // whether stock was reserved at the moment of cancelling
    const cancelled = await moveStatus(
        Order,
        before._id,
        [before.status],
        ORDER_STATUS.CANCELLED,
        { cancelReason: reason },
        { statusHistory: historyEntry(ORDER_STATUS.CANCELLED, currentUser._id, reason) }
    );
    if (!cancelled) {
        throw new AppError(409, "ORDER_CHANGED", `Order ${before.orderNumber} was changed by someone else. Reload it and try again.`);
    }

    const items = await OrderItem.find({ order: cancelled._id });
    const hadReservation = RESERVING_ORDER_STATUSES.includes(before.status);
    if (hadReservation) {
        await releaseOrderLines(cancelled, items);
    }

    await logAction({
        userId: currentUser._id,
        action: "ORDER_CANCELLED",
        entityType: "Order",
        entityId: cancelled._id,
        oldValue: { status: before.status },
        newValue: { status: cancelled.status, reason },
        metadata: { orderNumber: cancelled.orderNumber, stockReleased: hadReservation }
    });

    if (!cancelled.createdBy.equals(currentUser._id)) {
        await notifyUser(cancelled.createdBy, {
            type: NOTIFICATION_TYPE.ORDER_STATUS_CHANGED,
            title: "Order cancelled",
            message: `${cancelled.orderNumber} was cancelled by ${currentUser.name}${reason ? `: ${reason}` : "."}`,
            link: orderLink(cancelled)
        });
    }

    return getOrderWithItems(cancelled);
};

module.exports = {
    calculateLine,
    calculateOrderTotals,
    getOrders,
    getOrderById,
    createOrder,
    updateOrder,
    confirmOrder,
    cancelOrder
};

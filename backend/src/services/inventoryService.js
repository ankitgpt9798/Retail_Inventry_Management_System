const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
const StockTransaction = require("../models/StockTransaction");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const {
    ROLES,
    RECORD_STATUS,
    STOCK_TRANSACTION_TYPE,
    STOCK_REFERENCE_TYPE,
    NOTIFICATION_TYPE
} = require("../utils/constants");
const { getStockTotals } = require("./warehouseService");
const { logAction } = require("./auditService");
const { notifyRoles } = require("./notificationService");

const PRODUCT_FIELDS = "name sku reorderLevel status";
const WAREHOUSE_FIELDS = "name code city status";

// Who receives low-stock alerts
const LOW_STOCK_ALERT_ROLES = [ROLES.ADMIN, ROLES.INVENTORY_MANAGER];

// A MongoDB condition meaning "available (quantity - reserved) < reorderLevel".
// $expr lets a query compare fields of the same document with each other.
const LOW_STOCK_CONDITION = {
    $lt: [{ $subtract: ["$quantity", "$reservedQuantity"] }, "$reorderLevel"]
};

// ---------- Pure helpers (no database; easy to unit test) ----------

// Business Rule 1
const getAvailable = ({ quantity, reservedQuantity }) => {
    return quantity - reservedQuantity;
};

// Business Rule 7
const isLowStock = (inventory) => {
    return getAvailable(inventory) < inventory.reorderLevel;
};

// Alert only at the moment stock DROPS below the level, not on every change
// while it is already low (otherwise managers would get an alert per sale)
const becameLowStock = (before, after) => {
    return !isLowStock(before) && isLowStock(after);
};

// ---------- Lookups ----------

const findProductOrFail = async (productId) => {
    const product = await Product.findById(productId);
    if (!product) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    return product;
};

const findWarehouseOrFail = async (warehouseId) => {
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
        throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse not found");
    }
    return warehouse;
};

const findActiveProduct = async (productId) => {
    const product = await findProductOrFail(productId);
    if (product.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError(422, "PRODUCT_INACTIVE", `Product "${product.name}" is inactive`);
    }
    return product;
};

const findActiveWarehouse = async (warehouseId) => {
    const warehouse = await findWarehouseOrFail(warehouseId);
    if (warehouse.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError(422, "WAREHOUSE_INACTIVE", `Warehouse ${warehouse.code} is inactive`);
    }
    return warehouse;
};

const populateInventory = (inventory) => {
    return inventory.populate([
        { path: "product", select: PRODUCT_FIELDS },
        { path: "warehouse", select: WAREHOUSE_FIELDS }
    ]);
};

// ---------- What happens after every stock change ----------

// Business Rules 8 + 9: a permanent history line and an audit record
const recordStockChange = async ({ inventory, product, warehouse, type, quantity, quantityBefore, referenceType, referenceId, note, userId }) => {
    await StockTransaction.create({
        product: product._id,
        warehouse: warehouse._id,
        type,
        quantity,
        quantityBefore,
        quantityAfter: inventory.quantity,
        referenceType,
        referenceId,
        note,
        performedBy: userId
    });

    await logAction({
        userId,
        action: type,
        entityType: "Inventory",
        entityId: inventory._id,
        oldValue: { quantity: quantityBefore },
        newValue: { quantity: inventory.quantity },
        metadata: { product: product.sku, warehouse: warehouse.code, note }
    });
};

const sendLowStockAlert = async (inventory, product, warehouse) => {
    await notifyRoles(LOW_STOCK_ALERT_ROLES, {
        type: NOTIFICATION_TYPE.LOW_STOCK,
        title: "Low stock",
        message: `${product.name} (${product.sku}) is below reorder level in ${warehouse.code}: ` +
            `${getAvailable(inventory)} available, reorder level ${inventory.reorderLevel}.`,
        link: `/inventory/${inventory._id}`
    });
};

// ---------- Reusable stock movers ----------
// Stock-in/out use them now; transfers, purchase receiving and orders will reuse them
// with a different type/referenceType, so the rules live in ONE place.

// Business Rule 3: quantity += received
const addStock = async ({
    productId,
    warehouseId,
    quantity,
    userId,
    type = STOCK_TRANSACTION_TYPE.STOCK_IN,
    referenceType = STOCK_REFERENCE_TYPE.MANUAL,
    referenceId,
    note
}) => {
    const product = await findActiveProduct(productId);
    const warehouse = await findActiveWarehouse(warehouseId);

    // The warehouse must have room for the new units
    const { totalQuantity } = await getStockTotals(warehouse._id);
    if (totalQuantity + quantity > warehouse.capacity) {
        const freeSpace = warehouse.capacity - totalQuantity;
        throw new AppError(
            409,
            "CAPACITY_EXCEEDED",
            `${warehouse.code} can hold ${warehouse.capacity} units and has ${totalQuantity}; only ${freeSpace} more will fit`
        );
    }

    // upsert: update the row if it exists, otherwise create it.
    // $setOnInsert only applies when the row is created: it copies the product's
    // default reorder level into this warehouse's new inventory row.
    const inventory = await Inventory.findOneAndUpdate(
        { product: product._id, warehouse: warehouse._id },
        {
            $inc: { quantity },
            $setOnInsert: { reorderLevel: product.reorderLevel }
        },
        { upsert: true, returnDocument: "after" }
    );

    await recordStockChange({
        inventory,
        product,
        warehouse,
        type,
        quantity,
        quantityBefore: inventory.quantity - quantity,
        referenceType,
        referenceId,
        note,
        userId
    });

    return populateInventory(inventory);
};

// Removes AVAILABLE units (reserved units belong to customer orders and can't be taken)
const removeStock = async ({
    productId,
    warehouseId,
    quantity,
    userId,
    type = STOCK_TRANSACTION_TYPE.STOCK_OUT,
    referenceType = STOCK_REFERENCE_TYPE.MANUAL,
    referenceId,
    note
}) => {
    // An inactive product may still be removed (e.g. clearing discontinued stock)
    const product = await findProductOrFail(productId);
    const warehouse = await findWarehouseOrFail(warehouseId);

    // Check and change in ONE atomic operation, so two users removing stock at the
    // same moment can never take more than exists. If available < quantity,
    // the condition doesn't match, nothing changes, and we get null back.
    const inventory = await Inventory.findOneAndUpdate(
        {
            product: product._id,
            warehouse: warehouse._id,
            $expr: { $gte: [{ $subtract: ["$quantity", "$reservedQuantity"] }, quantity] }
        },
        { $inc: { quantity: -quantity } },
        { returnDocument: "after" }
    );

    if (!inventory) {
        const current = await Inventory.findOne({ product: product._id, warehouse: warehouse._id });
        const available = current ? current.availableQuantity : 0;
        throw new AppError(
            400,
            "INSUFFICIENT_STOCK",
            `Insufficient stock of ${product.sku} in ${warehouse.code}: ${available} available, ${quantity} requested`
        );
    }

    const quantityBefore = inventory.quantity + quantity;
    await recordStockChange({
        inventory,
        product,
        warehouse,
        type,
        quantity,
        quantityBefore,
        referenceType,
        referenceId,
        note,
        userId
    });

    const before = { quantity: quantityBefore, reservedQuantity: inventory.reservedQuantity, reorderLevel: inventory.reorderLevel };
    if (becameLowStock(before, inventory)) {
        await sendLowStockAlert(inventory, product, warehouse);
    }

    return populateInventory(inventory);
};

// ---------- Reads ----------

// GET /api/inventory — warehouse-wise view when ?warehouse= is given
const getInventory = async ({ warehouse, product, search, lowStock, page, limit }) => {
    const filter = {};

    if (warehouse) {
        filter.warehouse = warehouse;
    }

    if (product) {
        filter.product = product;
    }
    else if (search) {
        // Inventory rows don't contain product names, so first find the
        // matching products, then keep the rows that belong to them
        const searchPattern = new RegExp(escapeRegex(search), "i");
        const matchingProducts = await Product.find({ $or: [{ name: searchPattern }, { sku: searchPattern }] }, "_id");
        filter.product = { $in: matchingProducts.map((p) => p._id) };
    }

    if (lowStock) {
        filter.$expr = LOW_STOCK_CONDITION;
    }

    const [inventories, total] = await Promise.all([
        Inventory.find(filter)
            .populate("product", PRODUCT_FIELDS)
            .populate("warehouse", WAREHOUSE_FIELDS)
            .sort({ updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Inventory.countDocuments(filter)
    ]);

    return {
        inventories,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// GET /api/inventory/low-stock
const getLowStock = async ({ warehouse, page, limit }) => {
    return getInventory({ warehouse, lowStock: true, page, limit });
};

const getInventoryById = async (inventoryId) => {
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
        throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventory record not found");
    }
    return populateInventory(inventory);
};

// GET /api/inventory/product/:productId — product-wise view:
// Laptop: Delhi 100, Noida 50, Mumbai 75 → total 225
const getProductStock = async (productId) => {
    const product = await findProductOrFail(productId);
    const inventories = await Inventory.find({ product: product._id })
        .populate("warehouse", WAREHOUSE_FIELDS)
        .sort({ quantity: -1 });

    const totals = { quantity: 0, reservedQuantity: 0, availableQuantity: 0 };
    for (const inventory of inventories) {
        totals.quantity += inventory.quantity;
        totals.reservedQuantity += inventory.reservedQuantity;
        totals.availableQuantity += inventory.availableQuantity;
    }

    return { product, warehouses: inventories, totals };
};

// GET /api/inventory/transactions — the full movement history
const getTransactions = async ({ product, warehouse, type, from, to, page, limit }) => {
    const filter = {};
    if (product) filter.product = product;
    if (warehouse) filter.warehouse = warehouse;
    if (type) filter.type = type;
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }

    const [transactions, total] = await Promise.all([
        StockTransaction.find(filter)
            .populate("product", "name sku")
            .populate("warehouse", "name code")
            .populate("performedBy", "name")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        StockTransaction.countDocuments(filter)
    ]);

    return {
        transactions,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// ---------- Settings ----------

// PUT /api/inventory/:id/reorder-level — each warehouse can have its own level
const updateReorderLevel = async (inventoryId, reorderLevel, userId) => {
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
        throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventory record not found");
    }

    const before = { quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity, reorderLevel: inventory.reorderLevel };
    inventory.reorderLevel = reorderLevel;
    await inventory.save();
    await populateInventory(inventory);

    await logAction({
        userId,
        action: "REORDER_LEVEL_UPDATED",
        entityType: "Inventory",
        entityId: inventory._id,
        oldValue: { reorderLevel: before.reorderLevel },
        newValue: { reorderLevel },
        metadata: { product: inventory.product.sku, warehouse: inventory.warehouse.code }
    });

    // Raising the level can make existing stock "low" → alert
    if (becameLowStock(before, inventory)) {
        await sendLowStockAlert(inventory, inventory.product, inventory.warehouse);
    }

    return inventory;
};

module.exports = {
    getAvailable,
    isLowStock,
    becameLowStock,
    addStock,
    removeStock,
    getInventory,
    getLowStock,
    getInventoryById,
    getProductStock,
    getTransactions,
    updateReorderLevel
};

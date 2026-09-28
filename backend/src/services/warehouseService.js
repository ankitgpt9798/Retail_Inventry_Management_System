const Warehouse = require("../models/Warehouse");
const Inventory = require("../models/Inventory");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const { ROLES, RECORD_STATUS, USER_STATUS } = require("../utils/constants");
const { logAction, getChanges } = require("./auditService");

// Which user fields to show for the manager
const MANAGER_FIELDS = "name email role";

// Only these roles can be put in charge of a warehouse
const MANAGER_ROLES = [ROLES.INVENTORY_MANAGER, ROLES.ADMIN];

// ---------- Helpers ----------

const findWarehouseOrFail = async (warehouseId) => {
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
        throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse not found");
    }
    return warehouse;
};

const ensureCodeIsFree = async (code, exceptWarehouseId) => {
    // The model stores codes in uppercase, so we search in uppercase too
    const existingWarehouse = await Warehouse.findOne({ code: code.toUpperCase() });
    if (existingWarehouse && !existingWarehouse._id.equals(exceptWarehouseId)) {
        throw new AppError(409, "WAREHOUSE_CODE_EXISTS", `Code ${existingWarehouse.code} is already used by "${existingWarehouse.name}"`);
    }
};

const ensureValidManager = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new AppError(404, "MANAGER_NOT_FOUND", "Manager user not found");
    }
    if (!MANAGER_ROLES.includes(user.role)) {
        throw new AppError(422, "INVALID_MANAGER", "Warehouse manager must be an INVENTORY_MANAGER or ADMIN");
    }
    if (user.status !== USER_STATUS.ACTIVE) {
        throw new AppError(422, "INVALID_MANAGER", "Warehouse manager must be an active user");
    }
};

// Adds up all inventory records of one warehouse.
// Also used by the inventory module to check capacity before stock-in.
const getStockTotals = async (warehouseId) => {
    const inventories = await Inventory.find({ warehouse: warehouseId }, "quantity reservedQuantity");

    let totalQuantity = 0;
    let reservedQuantity = 0;
    let productCount = 0;

    for (const inventory of inventories) {
        totalQuantity += inventory.quantity;
        reservedQuantity += inventory.reservedQuantity;
        if (inventory.quantity > 0) {
            productCount += 1;
        }
    }

    return { totalQuantity, reservedQuantity, productCount };
};

// A warehouse that still holds goods can't be closed; move the stock out first
const ensureNoStock = async (warehouseId) => {
    const { totalQuantity } = await getStockTotals(warehouseId);
    if (totalQuantity > 0) {
        throw new AppError(
            409,
            "WAREHOUSE_HAS_STOCK",
            `Cannot deactivate: the warehouse still holds ${totalQuantity} unit(s). Transfer the stock out first.`
        );
    }
};

const getAuditFields = (warehouse) => ({
    name: warehouse.name,
    code: warehouse.code,
    address: warehouse.address,
    city: warehouse.city,
    state: warehouse.state,
    capacity: warehouse.capacity,
    manager: warehouse.manager ? warehouse.manager.toString() : null,
    status: warehouse.status
});

// ---------- Service functions ----------

// GET /api/warehouses
const getWarehouses = async ({ search, city, status, manager, page, limit }) => {
    const filter = {};

    if (search) {
        const searchPattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ name: searchPattern }, { code: searchPattern }, { city: searchPattern }];
    }
    if (city) {
        filter.city = new RegExp(`^${escapeRegex(city)}$`, "i");
    }
    if (status) {
        filter.status = status;
    }
    if (manager) {
        filter.manager = manager;
    }

    const [warehouses, total] = await Promise.all([
        Warehouse.find(filter)
            .populate("manager", MANAGER_FIELDS)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Warehouse.countDocuments(filter)
    ]);

    return {
        warehouses,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// GET /api/warehouses/:id — the warehouse plus how full it is
const getWarehouseById = async (warehouseId) => {
    const warehouse = await findWarehouseOrFail(warehouseId);
    await warehouse.populate("manager", MANAGER_FIELDS);

    const totals = await getStockTotals(warehouse._id);
    const stockSummary = {
        ...totals,
        availableQuantity: totals.totalQuantity - totals.reservedQuantity,
        // One decimal place, e.g. 42.5 (%)
        capacityUsedPercent: Math.round((totals.totalQuantity / warehouse.capacity) * 1000) / 10
    };

    return { warehouse, stockSummary };
};

const createWarehouse = async (data, currentUser) => {
    await ensureCodeIsFree(data.code);
    if (data.manager) {
        await ensureValidManager(data.manager);
    }

    const warehouse = await Warehouse.create(data);

    await logAction({
        userId: currentUser._id,
        action: "WAREHOUSE_CREATED",
        entityType: "Warehouse",
        entityId: warehouse._id,
        newValue: getAuditFields(warehouse)
    });

    await warehouse.populate("manager", MANAGER_FIELDS);
    return warehouse;
};

const updateWarehouse = async (warehouseId, updates, currentUser) => {
    const warehouse = await findWarehouseOrFail(warehouseId);

    if (updates.code) {
        await ensureCodeIsFree(updates.code, warehouse._id);
    }

    // Only check the manager when a (new) one is given; null means "remove manager"
    if (updates.manager) {
        await ensureValidManager(updates.manager);
    }

    // Capacity can't go below what is already stored
    if (updates.capacity !== undefined) {
        const { totalQuantity } = await getStockTotals(warehouse._id);
        if (updates.capacity < totalQuantity) {
            throw new AppError(
                409,
                "CAPACITY_BELOW_STOCK",
                `Capacity cannot be less than the ${totalQuantity} unit(s) currently in stock`
            );
        }
    }

    if (updates.status === RECORD_STATUS.INACTIVE && warehouse.status === RECORD_STATUS.ACTIVE) {
        await ensureNoStock(warehouse._id);
    }

    const before = getAuditFields(warehouse);
    warehouse.set(updates);
    await warehouse.save();

    const { oldValue, newValue } = getChanges(before, getAuditFields(warehouse));
    if (Object.keys(newValue).length > 0) {
        await logAction({
            userId: currentUser._id,
            action: "WAREHOUSE_UPDATED",
            entityType: "Warehouse",
            entityId: warehouse._id,
            oldValue,
            newValue
        });
    }

    await warehouse.populate("manager", MANAGER_FIELDS);
    return warehouse;
};

// DELETE /api/warehouses/:id — soft delete
const deactivateWarehouse = async (warehouseId, currentUser) => {
    const warehouse = await findWarehouseOrFail(warehouseId);

    if (warehouse.status !== RECORD_STATUS.INACTIVE) {
        await ensureNoStock(warehouse._id);

        warehouse.status = RECORD_STATUS.INACTIVE;
        await warehouse.save();

        await logAction({
            userId: currentUser._id,
            action: "WAREHOUSE_DEACTIVATED",
            entityType: "Warehouse",
            entityId: warehouse._id,
            oldValue: { status: RECORD_STATUS.ACTIVE },
            newValue: { status: RECORD_STATUS.INACTIVE }
        });
    }

    await warehouse.populate("manager", MANAGER_FIELDS);
    return warehouse;
};

module.exports = {
    getStockTotals,
    getWarehouses,
    getWarehouseById,
    createWarehouse,
    updateWarehouse,
    deactivateWarehouse
};

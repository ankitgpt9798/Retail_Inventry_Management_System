const inventoryService = require("../services/inventoryService");

// GET /api/inventory
const getInventory = async (req, res) => {
    const { inventories, pagination } = await inventoryService.getInventory(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Inventory fetched successfully",
        data: { inventories, pagination }
    });
};

// GET /api/inventory/low-stock
const getLowStock = async (req, res) => {
    const { inventories, pagination } = await inventoryService.getLowStock(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Low-stock items fetched successfully",
        data: { inventories, pagination }
    });
};

// GET /api/inventory/transactions
const getTransactions = async (req, res) => {
    const { transactions, pagination } = await inventoryService.getTransactions(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Stock transactions fetched successfully",
        data: { transactions, pagination }
    });
};

// GET /api/inventory/product/:productId
const getProductStock = async (req, res) => {
    const { product, warehouses, totals } = await inventoryService.getProductStock(req.params.productId);

    res.status(200).json({
        success: true,
        message: "Product stock fetched successfully",
        data: { product, warehouses, totals }
    });
};

// GET /api/inventory/:id
const getInventoryById = async (req, res) => {
    const inventory = await inventoryService.getInventoryById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Inventory record fetched successfully",
        data: { inventory }
    });
};

// POST /api/inventory/stock-in
const stockIn = async (req, res) => {
    const inventory = await inventoryService.addStock({
        productId: req.body.product,
        warehouseId: req.body.warehouse,
        quantity: req.body.quantity,
        note: req.body.note,
        userId: req.user._id
    });

    res.status(200).json({
        success: true,
        message: `Added ${req.body.quantity} unit(s) to stock`,
        data: { inventory }
    });
};

// POST /api/inventory/stock-out
const stockOut = async (req, res) => {
    const inventory = await inventoryService.removeStock({
        productId: req.body.product,
        warehouseId: req.body.warehouse,
        quantity: req.body.quantity,
        note: req.body.note,
        userId: req.user._id
    });

    res.status(200).json({
        success: true,
        message: `Removed ${req.body.quantity} unit(s) from stock`,
        data: { inventory }
    });
};

// PUT /api/inventory/:id/reorder-level
const updateReorderLevel = async (req, res) => {
    const inventory = await inventoryService.updateReorderLevel(req.params.id, req.body.reorderLevel, req.user._id);

    res.status(200).json({
        success: true,
        message: "Reorder level updated successfully",
        data: { inventory }
    });
};

module.exports = {
    getInventory,
    getLowStock,
    getTransactions,
    getProductStock,
    getInventoryById,
    stockIn,
    stockOut,
    updateReorderLevel
};

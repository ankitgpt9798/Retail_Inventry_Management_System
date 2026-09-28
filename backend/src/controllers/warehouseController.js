const warehouseService = require("../services/warehouseService");

// GET /api/warehouses
const getWarehouses = async (req, res) => {
    const { warehouses, pagination } = await warehouseService.getWarehouses(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Warehouses fetched successfully",
        data: { warehouses, pagination }
    });
};

// GET /api/warehouses/:id
const getWarehouseById = async (req, res) => {
    const { warehouse, stockSummary } = await warehouseService.getWarehouseById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Warehouse fetched successfully",
        data: { warehouse, stockSummary }
    });
};

// POST /api/warehouses
const createWarehouse = async (req, res) => {
    const warehouse = await warehouseService.createWarehouse(req.body, req.user);

    res.status(201).json({
        success: true,
        message: "Warehouse created successfully",
        data: { warehouse }
    });
};

// PUT /api/warehouses/:id
const updateWarehouse = async (req, res) => {
    const warehouse = await warehouseService.updateWarehouse(req.params.id, req.body, req.user);

    res.status(200).json({
        success: true,
        message: "Warehouse updated successfully",
        data: { warehouse }
    });
};

// DELETE /api/warehouses/:id
const deactivateWarehouse = async (req, res) => {
    const warehouse = await warehouseService.deactivateWarehouse(req.params.id, req.user);

    res.status(200).json({
        success: true,
        message: "Warehouse deactivated successfully",
        data: { warehouse }
    });
};

module.exports = { getWarehouses, getWarehouseById, createWarehouse, updateWarehouse, deactivateWarehouse };

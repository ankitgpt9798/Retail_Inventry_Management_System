const supplierService = require("../services/supplierService");

// Adds how many supplier logins were switched off, when that happened
const deactivationMessage = (baseMessage, deactivatedUserCount) => {
    if (deactivatedUserCount === 0) {
        return baseMessage;
    }
    return `${baseMessage} ${deactivatedUserCount} supplier login(s) were also deactivated.`;
};

// GET /api/suppliers
const getSuppliers = async (req, res) => {
    const { suppliers, pagination } = await supplierService.getSuppliers(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Suppliers fetched successfully",
        data: { suppliers, pagination }
    });
};

// GET /api/suppliers/:id
const getSupplierById = async (req, res) => {
    const { supplier, users } = await supplierService.getSupplierById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Supplier fetched successfully",
        data: { supplier, users }
    });
};

// POST /api/suppliers
const createSupplier = async (req, res) => {
    const supplier = await supplierService.createSupplier(req.body, req.user);

    res.status(201).json({
        success: true,
        message: "Supplier created successfully",
        data: { supplier }
    });
};

// PUT /api/suppliers/:id
const updateSupplier = async (req, res) => {
    const { supplier, deactivatedUserCount } = await supplierService.updateSupplier(req.params.id, req.body, req.user);

    res.status(200).json({
        success: true,
        message: deactivationMessage("Supplier updated successfully.", deactivatedUserCount),
        data: { supplier, deactivatedUserCount }
    });
};

// DELETE /api/suppliers/:id
const deactivateSupplier = async (req, res) => {
    const { supplier, deactivatedUserCount } = await supplierService.deactivateSupplier(req.params.id, req.user);

    res.status(200).json({
        success: true,
        message: deactivationMessage("Supplier deactivated.", deactivatedUserCount),
        data: { supplier, deactivatedUserCount }
    });
};

module.exports = { getSuppliers, getSupplierById, createSupplier, updateSupplier, deactivateSupplier };

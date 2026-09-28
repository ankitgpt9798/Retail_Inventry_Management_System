const reportService = require("../services/reportService");

// Every report is read-only and has the same response shape,
// so one small helper builds the controller for each of them.
const sendReport = (res, message, data) => {
    res.status(200).json({ success: true, message, data });
};

// GET /api/reports/dashboard
const getDashboard = async (req, res) => {
    sendReport(res, "Dashboard fetched successfully", await reportService.getDashboard());
};

// GET /api/reports/inventory
const getInventoryReport = async (req, res) => {
    sendReport(res, "Inventory report generated", await reportService.getInventoryReport(req.validatedQuery));
};

// GET /api/reports/warehouses
const getWarehouseReport = async (req, res) => {
    sendReport(res, "Warehouse report generated", await reportService.getWarehouseReport());
};

// GET /api/reports/stock-movement
const getStockMovementReport = async (req, res) => {
    sendReport(res, "Stock movement report generated", await reportService.getStockMovementReport(req.validatedQuery));
};

// GET /api/reports/orders
const getOrdersReport = async (req, res) => {
    sendReport(res, "Order report generated", await reportService.getOrdersReport(req.validatedQuery));
};

// GET /api/reports/purchases
const getPurchasesReport = async (req, res) => {
    sendReport(res, "Purchase report generated", await reportService.getPurchasesReport(req.validatedQuery));
};

// GET /api/reports/suppliers
const getSupplierReport = async (req, res) => {
    sendReport(res, "Supplier report generated", await reportService.getSupplierReport(req.validatedQuery));
};

// GET /api/reports/low-stock
const getLowStockReport = async (req, res) => {
    sendReport(res, "Low-stock report generated", await reportService.getLowStockReport(req.validatedQuery));
};

// GET /api/reports/product-performance
const getProductPerformance = async (req, res) => {
    sendReport(res, "Product performance report generated", await reportService.getProductPerformance(req.validatedQuery));
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

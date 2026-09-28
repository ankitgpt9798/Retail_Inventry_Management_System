const express = require("express");
const reportController = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    inventoryReportQuerySchema,
    stockMovementQuerySchema,
    ordersReportQuerySchema,
    purchasesReportQuerySchema,
    supplierReportQuerySchema,
    lowStockReportQuerySchema,
    productPerformanceQuerySchema
} = require("../validators/reportValidators");

const router = express.Router();

// Spec: Admin and Inventory Manager "view reports".
// The dashboard (counts and trends only) is the staff app's home page, so STAFF see it too.
const canViewDashboard = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF);
const canViewReports = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER);

router.use(protect);

router.get("/dashboard", canViewDashboard, reportController.getDashboard);
router.get("/inventory", canViewReports, validate(inventoryReportQuerySchema, "query"), reportController.getInventoryReport);
router.get("/warehouses", canViewReports, reportController.getWarehouseReport);
router.get("/stock-movement", canViewReports, validate(stockMovementQuerySchema, "query"), reportController.getStockMovementReport);
router.get("/orders", canViewReports, validate(ordersReportQuerySchema, "query"), reportController.getOrdersReport);
router.get("/purchases", canViewReports, validate(purchasesReportQuerySchema, "query"), reportController.getPurchasesReport);
router.get("/suppliers", canViewReports, validate(supplierReportQuerySchema, "query"), reportController.getSupplierReport);
router.get("/low-stock", canViewReports, validate(lowStockReportQuerySchema, "query"), reportController.getLowStockReport);
router.get("/product-performance", canViewReports, validate(productPerformanceQuerySchema, "query"), reportController.getProductPerformance);

module.exports = router;

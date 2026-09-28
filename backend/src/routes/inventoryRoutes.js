const express = require("express");
const inventoryController = require("../controllers/inventoryController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    stockInSchema,
    stockOutSchema,
    reorderLevelSchema,
    listInventoryQuerySchema,
    lowStockQuerySchema,
    transactionsQuerySchema
} = require("../validators/inventoryValidators");

const router = express.Router();

// Staff can check stock; admins and inventory managers change it
const canView = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF);
const canManage = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER);

router.use(protect);

// Fixed paths first — otherwise "/:id" would catch "low-stock", "transactions" and "product"
router.get("/", canView, validate(listInventoryQuerySchema, "query"), inventoryController.getInventory);
router.get("/low-stock", canView, validate(lowStockQuerySchema, "query"), inventoryController.getLowStock);
router.get("/transactions", canView, validate(transactionsQuerySchema, "query"), inventoryController.getTransactions);
router.get("/product/:productId", canView, inventoryController.getProductStock);
router.post("/stock-in", canManage, validate(stockInSchema), inventoryController.stockIn);
router.post("/stock-out", canManage, validate(stockOutSchema), inventoryController.stockOut);

router.get("/:id", canView, inventoryController.getInventoryById);
router.put("/:id/reorder-level", canManage, validate(reorderLevelSchema), inventoryController.updateReorderLevel);

module.exports = router;

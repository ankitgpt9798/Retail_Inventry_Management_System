const express = require("express");
const warehouseController = require("../controllers/warehouseController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createWarehouseSchema,
    updateWarehouseSchema,
    listWarehousesQuerySchema
} = require("../validators/warehouseValidators");

const router = express.Router();

// Staff need to see warehouses (e.g. to choose one for an order);
// admins and inventory managers manage them
const canView = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF);
const canManage = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER);

router.use(protect);

router.get("/", canView, validate(listWarehousesQuerySchema, "query"), warehouseController.getWarehouses);
router.get("/:id", canView, warehouseController.getWarehouseById);
router.post("/", canManage, validate(createWarehouseSchema), warehouseController.createWarehouse);
router.put("/:id", canManage, validate(updateWarehouseSchema), warehouseController.updateWarehouse);
router.delete("/:id", canManage, warehouseController.deactivateWarehouse);

module.exports = router;

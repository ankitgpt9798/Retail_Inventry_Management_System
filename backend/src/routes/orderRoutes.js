const express = require("express");
const orderController = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createOrderSchema,
    updateOrderSchema,
    cancelOrderSchema,
    listOrdersQuerySchema
} = require("../validators/orderValidators");

const router = express.Router();

// Spec: staff create and process orders; admins can do everything;
// inventory managers can see orders (they need to know what is holding stock)
const canView = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF);
const canManage = authorize(ROLES.ADMIN, ROLES.STAFF);

router.use(protect);

router.get("/", canView, validate(listOrdersQuerySchema, "query"), orderController.getOrders);
router.get("/:id", canView, orderController.getOrderById);
router.post("/", canManage, validate(createOrderSchema), orderController.createOrder);
router.put("/:id", canManage, validate(updateOrderSchema), orderController.updateOrder);
router.put("/:id/confirm", canManage, orderController.confirmOrder);
// "Delete" cancels the order (it is kept for history, like every other delete in this API)
router.delete("/:id", canManage, validate(cancelOrderSchema), orderController.cancelOrder);

module.exports = router;

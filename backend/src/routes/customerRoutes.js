const express = require("express");
const customerController = require("../controllers/customerController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const { listCustomersQuerySchema } = require("../validators/customerValidators");

const router = express.Router();

// Read-only: customers are built from orders, so whoever can see orders can see customers.
// To change a customer's details, edit their order.
router.use(protect, authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF));

router.get("/", validate(listCustomersQuerySchema, "query"), customerController.getCustomers);

module.exports = router;

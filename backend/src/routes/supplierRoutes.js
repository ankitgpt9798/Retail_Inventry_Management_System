const express = require("express");
const supplierController = require("../controllers/supplierController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createSupplierSchema,
    updateSupplierSchema,
    listSuppliersQuerySchema
} = require("../validators/supplierValidators");

const router = express.Router();

// Spec: Admin and Inventory Manager manage suppliers.
// (SUPPLIER users get their own purchase-order portal in Step 11.)
router.use(protect, authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER));

router.get("/", validate(listSuppliersQuerySchema, "query"), supplierController.getSuppliers);
router.get("/:id", supplierController.getSupplierById);
router.post("/", validate(createSupplierSchema), supplierController.createSupplier);
router.put("/:id", validate(updateSupplierSchema), supplierController.updateSupplier);
router.delete("/:id", supplierController.deactivateSupplier);

module.exports = router;

const express = require("express");
const productController = require("../controllers/productController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createProductSchema,
    updateProductSchema,
    listProductsQuerySchema
} = require("../validators/productValidators");

const router = express.Router();

// Staff roles can look at the catalog; only admins can change it
const canView = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF);
const adminOnly = authorize(ROLES.ADMIN);

router.use(protect);

router.get("/", canView, validate(listProductsQuerySchema, "query"), productController.getProducts);
router.get("/:id", canView, productController.getProductById);
router.post("/", adminOnly, validate(createProductSchema), productController.createProduct);
router.put("/:id", adminOnly, validate(updateProductSchema), productController.updateProduct);
router.delete("/:id", adminOnly, productController.deactivateProduct);

module.exports = router;

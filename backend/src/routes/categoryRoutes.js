const express = require("express");
const categoryController = require("../controllers/categoryController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createCategorySchema,
    updateCategorySchema,
    listCategoriesQuerySchema
} = require("../validators/categoryValidators");

const router = express.Router();

// Staff roles can look at the catalog; only admins can change it
const canView = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.STAFF);
const adminOnly = authorize(ROLES.ADMIN);

router.use(protect);

router.get("/", canView, validate(listCategoriesQuerySchema, "query"), categoryController.getCategories);
router.post("/", adminOnly, validate(createCategorySchema), categoryController.createCategory);
router.put("/:id", adminOnly, validate(updateCategorySchema), categoryController.updateCategory);
router.delete("/:id", adminOnly, categoryController.deactivateCategory);

module.exports = router;

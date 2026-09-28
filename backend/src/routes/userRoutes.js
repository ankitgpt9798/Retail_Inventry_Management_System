const express = require("express");
const userController = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createUserSchema,
    updateUserSchema,
    resetPasswordSchema,
    updateProfileSchema,
    changePasswordSchema,
    listUsersQuerySchema
} = require("../validators/userValidators");

const router = express.Router();

// Every route in this file needs a logged-in user
router.use(protect);

// ----- Own profile (any role) -----
// These must come BEFORE "/:id", otherwise Express would treat "profile" as an id
router.put("/profile", validate(updateProfileSchema), userController.updateProfile);
router.put("/profile/password", validate(changePasswordSchema), userController.changeOwnPassword);

// ----- User management (ADMIN only) -----
const adminOnly = authorize(ROLES.ADMIN);

router.get("/", adminOnly, validate(listUsersQuerySchema, "query"), userController.getUsers);
router.post("/", adminOnly, validate(createUserSchema), userController.createUser);
router.get("/:id", adminOnly, userController.getUserById);
router.put("/:id", adminOnly, validate(updateUserSchema), userController.updateUser);
router.put("/:id/password", adminOnly, validate(resetPasswordSchema), userController.resetUserPassword);
router.delete("/:id", adminOnly, userController.deactivateUser);

module.exports = router;

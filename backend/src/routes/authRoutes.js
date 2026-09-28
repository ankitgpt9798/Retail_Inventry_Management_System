const express = require("express");
const { register, login, logout, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const { registerSchema, loginSchema } = require("../validators/authValidators");

const router = express.Router();

// Each route reads left to right: URL → middleware → ... → controller
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", protect, getMe);

module.exports = router;

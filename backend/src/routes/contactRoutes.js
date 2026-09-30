const express = require("express");
const contactController = require("../controllers/contactController");
const validate = require("../middleware/validationMiddleware");
const { contactMessageSchema } = require("../validators/contactValidators");

const router = express.Router();

// Public: anyone on the website can send a message (no login)
router.post("/", validate(contactMessageSchema), contactController.sendContactMessage);

module.exports = router;

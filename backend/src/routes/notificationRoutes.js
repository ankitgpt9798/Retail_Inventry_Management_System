const express = require("express");
const notificationController = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const { listNotificationsQuerySchema } = require("../validators/notificationValidators");

const router = express.Router();

// Only "protect", no authorize(...): every role (including SUPPLIER) receives
// notifications. Each user is limited to their own by the database queries.
router.use(protect);

// Fixed paths BEFORE "/:id", otherwise "unread-count" and "read-all" would be treated as ids
router.get("/", validate(listNotificationsQuerySchema, "query"), notificationController.getMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/read-all", notificationController.markAllAsRead);

router.put("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;

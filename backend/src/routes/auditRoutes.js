const express = require("express");
const auditController = require("../controllers/auditController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const { listAuditLogsQuerySchema } = require("../validators/auditValidators");

const router = express.Router();

// Spec: only the Admin views audit logs.
// Read-only on purpose: there are NO post/put/delete routes here.
router.use(protect, authorize(ROLES.ADMIN));

router.get("/", validate(listAuditLogsQuerySchema, "query"), auditController.getAuditLogs);
// Fixed path before "/:id", otherwise "filters" would be treated as an id
router.get("/filters", auditController.getAuditFilters);
router.get("/:id", auditController.getAuditLogById);

module.exports = router;

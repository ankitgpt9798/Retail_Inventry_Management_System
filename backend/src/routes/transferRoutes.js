const express = require("express");
const transferController = require("../controllers/transferController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createTransferSchema,
    rejectTransferSchema,
    cancelTransferSchema,
    listTransfersQuerySchema
} = require("../validators/transferValidators");

const router = express.Router();

// Transfers are an inventory-manager job (spec: "Manager can create / approve stock transfers")
router.use(protect, authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER));

router.get("/", validate(listTransfersQuerySchema, "query"), transferController.getTransfers);
router.get("/:id", transferController.getTransferById);
router.post("/", validate(createTransferSchema), transferController.createTransfer);
router.put("/:id/approve", transferController.approveTransfer);
router.put("/:id/reject", validate(rejectTransferSchema), transferController.rejectTransfer);
router.put("/:id/dispatch", transferController.dispatchTransfer);
router.put("/:id/receive", transferController.receiveTransfer);
router.put("/:id/cancel", validate(cancelTransferSchema), transferController.cancelTransfer);

module.exports = router;

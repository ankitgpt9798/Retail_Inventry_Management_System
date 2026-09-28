const express = require("express");
const purchaseController = require("../controllers/purchaseController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const validate = require("../middleware/validationMiddleware");
const { ROLES } = require("../utils/constants");
const {
    createPurchaseSchema,
    updatePurchaseSchema,
    rejectPurchaseSchema,
    cancelPurchaseSchema,
    confirmPurchaseSchema,
    deliveryUpdateSchema,
    receivePurchaseSchema,
    listPurchasesQuerySchema
} = require("../validators/purchaseValidators");

const router = express.Router();

// Managers run the purchasing workflow; suppliers use the portal actions;
// both can view (the service limits suppliers to their own ordered POs)
const canManage = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER);
const supplierOnly = authorize(ROLES.SUPPLIER);
const canView = authorize(ROLES.ADMIN, ROLES.INVENTORY_MANAGER, ROLES.SUPPLIER);

router.use(protect);

router.get("/", canView, validate(listPurchasesQuerySchema, "query"), purchaseController.getPurchases);
router.get("/:id", canView, purchaseController.getPurchaseById);

router.post("/", canManage, validate(createPurchaseSchema), purchaseController.createPurchase);
router.put("/:id", canManage, validate(updatePurchaseSchema), purchaseController.updateDraft);
router.put("/:id/submit", canManage, purchaseController.submitPurchase);
router.put("/:id/approve", canManage, purchaseController.approvePurchase);
router.put("/:id/reject", canManage, validate(rejectPurchaseSchema), purchaseController.rejectPurchase);
router.put("/:id/order", canManage, purchaseController.orderPurchase);
router.put("/:id/receive", canManage, validate(receivePurchaseSchema), purchaseController.receivePurchase);
router.put("/:id/cancel", canManage, validate(cancelPurchaseSchema), purchaseController.cancelPurchase);

// Supplier portal
router.put("/:id/confirm", supplierOnly, validate(confirmPurchaseSchema), purchaseController.confirmPurchase);
router.put("/:id/delivery", supplierOnly, validate(deliveryUpdateSchema), purchaseController.updateDelivery);

module.exports = router;

const purchaseService = require("../services/purchaseService");

// Every step returns the updated purchase order in the same shape
const sendPurchase = (res, statusCode, message, purchase) => {
    res.status(statusCode).json({
        success: true,
        message,
        data: { purchase }
    });
};

// GET /api/purchases (suppliers only get their own — handled in the service)
const getPurchases = async (req, res) => {
    const { purchases, pagination } = await purchaseService.getPurchases(req.validatedQuery, req.user);

    res.status(200).json({
        success: true,
        message: "Purchase orders fetched successfully",
        data: { purchases, pagination }
    });
};

// GET /api/purchases/:id
const getPurchaseById = async (req, res) => {
    const purchase = await purchaseService.getPurchaseById(req.params.id, req.user);
    sendPurchase(res, 200, "Purchase order fetched successfully", purchase);
};

// POST /api/purchases
const createPurchase = async (req, res) => {
    const purchase = await purchaseService.createPurchase(req.body, req.user);
    sendPurchase(res, 201, `Purchase order ${purchase.poNumber} created (${purchase.status})`, purchase);
};

// PUT /api/purchases/:id
const updateDraft = async (req, res) => {
    const purchase = await purchaseService.updateDraft(req.params.id, req.body, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} updated`, purchase);
};

// PUT /api/purchases/:id/submit
const submitPurchase = async (req, res) => {
    const purchase = await purchaseService.submitPurchase(req.params.id, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} submitted for approval`, purchase);
};

// PUT /api/purchases/:id/approve
const approvePurchase = async (req, res) => {
    const purchase = await purchaseService.approvePurchase(req.params.id, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} approved`, purchase);
};

// PUT /api/purchases/:id/reject
const rejectPurchase = async (req, res) => {
    const purchase = await purchaseService.rejectPurchase(req.params.id, req.body.reason, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} rejected`, purchase);
};

// PUT /api/purchases/:id/order
const orderPurchase = async (req, res) => {
    const purchase = await purchaseService.orderPurchase(req.params.id, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} sent to ${purchase.supplier.name}`, purchase);
};

// PUT /api/purchases/:id/confirm (supplier)
const confirmPurchase = async (req, res) => {
    const purchase = await purchaseService.confirmPurchase(req.params.id, req.body, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} confirmed`, purchase);
};

// PUT /api/purchases/:id/delivery (supplier)
const updateDelivery = async (req, res) => {
    const purchase = await purchaseService.updateDelivery(req.params.id, req.body, req.user);
    sendPurchase(res, 200, `Delivery details for ${purchase.poNumber} updated`, purchase);
};

// PUT /api/purchases/:id/receive
const receivePurchase = async (req, res) => {
    const purchase = await purchaseService.receivePurchase(req.params.id, req.body.items, req.user);
    sendPurchase(res, 200, `Goods received on ${purchase.poNumber} (${purchase.status})`, purchase);
};

// PUT /api/purchases/:id/cancel
const cancelPurchase = async (req, res) => {
    const purchase = await purchaseService.cancelPurchase(req.params.id, req.body.reason, req.user);
    sendPurchase(res, 200, `Purchase order ${purchase.poNumber} cancelled`, purchase);
};

module.exports = {
    getPurchases,
    getPurchaseById,
    createPurchase,
    updateDraft,
    submitPurchase,
    approvePurchase,
    rejectPurchase,
    orderPurchase,
    confirmPurchase,
    updateDelivery,
    receivePurchase,
    cancelPurchase
};

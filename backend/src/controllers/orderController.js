const orderService = require("../services/orderService");

// Every order response has the same shape: the order and its lines
const sendOrder = (res, statusCode, message, { order, items }) => {
    res.status(statusCode).json({
        success: true,
        message,
        data: { order, items }
    });
};

// GET /api/orders
const getOrders = async (req, res) => {
    const { orders, pagination } = await orderService.getOrders(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Orders fetched successfully",
        data: { orders, pagination }
    });
};

// GET /api/orders/:id
const getOrderById = async (req, res) => {
    const result = await orderService.getOrderById(req.params.id);
    sendOrder(res, 200, "Order fetched successfully", result);
};

// POST /api/orders
const createOrder = async (req, res) => {
    const result = await orderService.createOrder(req.body, req.user);
    sendOrder(res, 201, `Order ${result.order.orderNumber} created (${result.order.status})`, result);
};

// PUT /api/orders/:id
const updateOrder = async (req, res) => {
    const result = await orderService.updateOrder(req.params.id, req.body, req.user);
    sendOrder(res, 200, `Order ${result.order.orderNumber} updated`, result);
};

// PUT /api/orders/:id/confirm
const confirmOrder = async (req, res) => {
    const result = await orderService.confirmOrder(req.params.id, req.user);
    sendOrder(res, 200, `Order ${result.order.orderNumber} confirmed and stock reserved`, result);
};

// DELETE /api/orders/:id
const cancelOrder = async (req, res) => {
    const reason = req.body ? req.body.reason : undefined;
    const result = await orderService.cancelOrder(req.params.id, reason, req.user);
    sendOrder(res, 200, `Order ${result.order.orderNumber} cancelled`, result);
};

// GET /api/orders/fulfillment-queue
const getFulfillmentQueue = async (req, res) => {
    const queue = await orderService.getFulfillmentQueue();

    res.status(200).json({
        success: true,
        message: "Fulfillment queue fetched successfully",
        data: { queue }
    });
};

// PUT /api/orders/:id/status
const updateOrderStatus = async (req, res) => {
    const result = await orderService.updateOrderStatus(req.params.id, req.body, req.user);
    sendOrder(res, 200, `Order ${result.order.orderNumber} is now ${result.order.status}`, result);
};

module.exports = {
    getOrders,
    getOrderById,
    createOrder,
    updateOrder,
    confirmOrder,
    cancelOrder,
    getFulfillmentQueue,
    updateOrderStatus
};

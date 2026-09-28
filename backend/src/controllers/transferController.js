const transferService = require("../services/transferService");

// Every workflow step returns the updated transfer in the same shape
const sendTransfer = (res, statusCode, message, transfer) => {
    res.status(statusCode).json({
        success: true,
        message,
        data: { transfer }
    });
};

// GET /api/transfers
const getTransfers = async (req, res) => {
    const { transfers, pagination } = await transferService.getTransfers(req.validatedQuery);

    res.status(200).json({
        success: true,
        message: "Transfers fetched successfully",
        data: { transfers, pagination }
    });
};

// GET /api/transfers/:id
const getTransferById = async (req, res) => {
    const transfer = await transferService.getTransferById(req.params.id);
    sendTransfer(res, 200, "Transfer fetched successfully", transfer);
};

// POST /api/transfers
const createTransfer = async (req, res) => {
    const transfer = await transferService.createTransfer(req.body, req.user);
    sendTransfer(res, 201, `Transfer ${transfer.transferNumber} requested`, transfer);
};

// PUT /api/transfers/:id/approve
const approveTransfer = async (req, res) => {
    const transfer = await transferService.approveTransfer(req.params.id, req.user);
    sendTransfer(res, 200, `Transfer ${transfer.transferNumber} approved`, transfer);
};

// PUT /api/transfers/:id/reject
const rejectTransfer = async (req, res) => {
    const transfer = await transferService.rejectTransfer(req.params.id, req.body.reason, req.user);
    sendTransfer(res, 200, `Transfer ${transfer.transferNumber} rejected`, transfer);
};

// PUT /api/transfers/:id/dispatch
const dispatchTransfer = async (req, res) => {
    const transfer = await transferService.dispatchTransfer(req.params.id, req.user);
    sendTransfer(res, 200, `Transfer ${transfer.transferNumber} dispatched`, transfer);
};

// PUT /api/transfers/:id/receive
const receiveTransfer = async (req, res) => {
    const transfer = await transferService.receiveTransfer(req.params.id, req.user);
    sendTransfer(res, 200, `Transfer ${transfer.transferNumber} received`, transfer);
};

// PUT /api/transfers/:id/cancel
const cancelTransfer = async (req, res) => {
    const transfer = await transferService.cancelTransfer(req.params.id, req.body.reason, req.user);
    sendTransfer(res, 200, `Transfer ${transfer.transferNumber} cancelled`, transfer);
};

module.exports = {
    getTransfers,
    getTransferById,
    createTransfer,
    approveTransfer,
    rejectTransfer,
    dispatchTransfer,
    receiveTransfer,
    cancelTransfer
};

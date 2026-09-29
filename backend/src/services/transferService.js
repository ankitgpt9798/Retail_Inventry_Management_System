const StockTransfer = require("../models/StockTransfer");
const Inventory = require("../models/Inventory");
const Warehouse = require("../models/Warehouse");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const moveStatus = require("../utils/moveStatus");
const {
    ROLES,
    TRANSFER_STATUS,
    STOCK_TRANSACTION_TYPE,
    STOCK_REFERENCE_TYPE,
    NOTIFICATION_TYPE
} = require("../utils/constants");
const { findActiveProduct, findActiveWarehouse, addStock, removeStock } = require("./inventoryService");
const { getNextCode } = require("./counterService");
const { logAction } = require("./auditService");
const { notifyRoles, notifyUser } = require("./notificationService");

// Who gets told about new transfer requests
const TRANSFER_MANAGER_ROLES = [ROLES.ADMIN, ROLES.INVENTORY_MANAGER];

// ---------- Helpers ----------

const populateTransfer = (transfer) => {
    return transfer.populate([
        { path: "product", select: "name sku" },
        { path: "fromWarehouse", select: "name code" },
        { path: "toWarehouse", select: "name code" },
        { path: "requestedBy", select: "name" },
        { path: "approvedBy", select: "name" },
        { path: "rejectedBy", select: "name" },
        { path: "dispatchedBy", select: "name" },
        { path: "receivedBy", select: "name" },
        { path: "cancelledBy", select: "name" }
    ]);
};

const findTransferOrFail = async (transferId) => {
    const transfer = await StockTransfer.findById(transferId);
    if (!transfer) {
        throw new AppError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    }
    return transfer;
};

// Early, read-only check that the source can supply the quantity.
// The real, atomic check happens at dispatch (removeStock).
const ensureEnoughAvailable = async (product, warehouse, quantity) => {
    const inventory = await Inventory.findOne({ product: product._id, warehouse: warehouse._id });
    const available = inventory ? inventory.availableQuantity : 0;

    if (available < quantity) {
        throw new AppError(
            400,
            "INSUFFICIENT_STOCK",
            `Insufficient stock of ${product.sku} in ${warehouse.code}: ${available} available, ${quantity} requested`
        );
    }
};

// Moves a transfer from one status to the next in ONE atomic operation (utils/moveStatus).
// If two people click "Dispatch" at the same moment, only one update finds the
// transfer still APPROVED — the other gets a 409 instead of removing stock twice.
const moveTransferStatus = async (transferId, allowedFromStatuses, toStatus, extraFields) => {
    const transfer = await moveStatus(StockTransfer, transferId, allowedFromStatuses, toStatus, extraFields);

    if (!transfer) {
        const current = await findTransferOrFail(transferId);
        throw new AppError(
            409,
            "INVALID_TRANSFER_STATUS",
            `Transfer ${current.transferNumber} is ${current.status}; it must be ${allowedFromStatuses.join(" or ")} to do this`
        );
    }

    return transfer;
};

// Undo a status change when the stock step after it failed
const revertStatus = async (transferId, previousStatus, fieldsToClear) => {
    await StockTransfer.updateOne(
        { _id: transferId },
        { $set: { status: previousStatus }, $unset: fieldsToClear }
    );
};

const auditStatusChange = async (transfer, action, fromStatus, userId, extra = {}) => {
    await logAction({
        userId,
        action,
        entityType: "StockTransfer",
        entityId: transfer._id,
        oldValue: { status: fromStatus },
        newValue: { status: transfer.status, ...extra },
        metadata: { transferNumber: transfer.transferNumber, quantity: transfer.quantity }
    });
};

// The app has no page per transfer: the transfers list is the page to open
const transferLink = () => "/transfers";

// ---------- Reads ----------

// GET /api/transfers
const getTransfers = async ({ status, product, warehouse, fromWarehouse, toWarehouse, search, page, limit }) => {
    const filter = {};
    if (status) filter.status = status;
    if (product) filter.product = product;
    if (fromWarehouse) filter.fromWarehouse = fromWarehouse;
    if (toWarehouse) filter.toWarehouse = toWarehouse;
    if (warehouse) {
        // Either side of the transfer
        filter.$or = [{ fromWarehouse: warehouse }, { toWarehouse: warehouse }];
    }
    if (search) {
        filter.transferNumber = new RegExp(escapeRegex(search), "i");
    }

    const [transfers, total] = await Promise.all([
        StockTransfer.find(filter)
            .populate("product", "name sku")
            .populate("fromWarehouse", "name code")
            .populate("toWarehouse", "name code")
            .populate("requestedBy", "name")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        StockTransfer.countDocuments(filter)
    ]);

    return {
        transfers,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

const getTransferById = async (transferId) => {
    const transfer = await findTransferOrFail(transferId);
    return populateTransfer(transfer);
};

// ---------- Workflow steps ----------

// POST /api/transfers → REQUESTED
const createTransfer = async ({ product: productId, fromWarehouse, toWarehouse, quantity, notes }, currentUser) => {
    const product = await findActiveProduct(productId);
    const source = await findActiveWarehouse(fromWarehouse);
    const destination = await findActiveWarehouse(toWarehouse);

    await ensureEnoughAvailable(product, source, quantity);

    const transfer = await StockTransfer.create({
        transferNumber: await getNextCode("transfer", "TRF"),
        product: product._id,
        fromWarehouse: source._id,
        toWarehouse: destination._id,
        quantity,
        notes,
        requestedBy: currentUser._id
    });

    await logAction({
        userId: currentUser._id,
        action: "TRANSFER_REQUESTED",
        entityType: "StockTransfer",
        entityId: transfer._id,
        newValue: { status: transfer.status, quantity, from: source.code, to: destination.code },
        metadata: { transferNumber: transfer.transferNumber, product: product.sku }
    });

    await notifyRoles(TRANSFER_MANAGER_ROLES, {
        type: NOTIFICATION_TYPE.STOCK_TRANSFER,
        title: "Transfer needs approval",
        message: `${transfer.transferNumber}: ${quantity} × ${product.name} from ${source.code} to ${destination.code} needs approval.`,
        link: transferLink(transfer)
    }, currentUser._id);

    return populateTransfer(transfer);
};

// PUT /api/transfers/:id/approve  REQUESTED → APPROVED
const approveTransfer = async (transferId, currentUser) => {
    const transfer = await findTransferOrFail(transferId);

    // Segregation of duties: someone else must approve
    if (transfer.requestedBy.equals(currentUser._id)) {
        throw new AppError(403, "SELF_APPROVAL_NOT_ALLOWED", "You cannot approve your own transfer request");
    }

    // Give a clear status error before checking stock
    if (transfer.status !== TRANSFER_STATUS.REQUESTED) {
        throw new AppError(409, "INVALID_TRANSFER_STATUS", `Transfer ${transfer.transferNumber} is ${transfer.status}; it must be REQUESTED to do this`);
    }

    // Don't approve something that can't be fulfilled right now
    await populateTransfer(transfer);
    await ensureEnoughAvailable(transfer.product, transfer.fromWarehouse, transfer.quantity);

    const approved = await moveTransferStatus(transfer._id, [TRANSFER_STATUS.REQUESTED], TRANSFER_STATUS.APPROVED, {
        approvedBy: currentUser._id,
        approvedAt: new Date()
    });

    await auditStatusChange(approved, "TRANSFER_APPROVED", TRANSFER_STATUS.REQUESTED, currentUser._id);
    await notifyUser(approved.requestedBy, {
        type: NOTIFICATION_TYPE.STOCK_TRANSFER,
        title: "Transfer approved",
        message: `${approved.transferNumber} was approved by ${currentUser.name} and can be dispatched.`,
        link: transferLink(approved)
    });

    return populateTransfer(approved);
};

// PUT /api/transfers/:id/reject  REQUESTED → REJECTED
const rejectTransfer = async (transferId, reason, currentUser) => {
    const rejected = await moveTransferStatus(transferId, [TRANSFER_STATUS.REQUESTED], TRANSFER_STATUS.REJECTED, {
        rejectedBy: currentUser._id,
        rejectedAt: new Date(),
        rejectionReason: reason
    });

    await auditStatusChange(rejected, "TRANSFER_REJECTED", TRANSFER_STATUS.REQUESTED, currentUser._id, { reason });
    await notifyUser(rejected.requestedBy, {
        type: NOTIFICATION_TYPE.STOCK_TRANSFER,
        title: "Transfer rejected",
        message: `${rejected.transferNumber} was rejected by ${currentUser.name}: ${reason}`,
        link: transferLink(rejected)
    });

    return populateTransfer(rejected);
};

// PUT /api/transfers/:id/dispatch  APPROVED → DISPATCHED, source quantity -= X
const dispatchTransfer = async (transferId, currentUser) => {
    // 1. Claim the transfer first (atomic), so it can only be dispatched once
    const transfer = await moveTransferStatus(transferId, [TRANSFER_STATUS.APPROVED], TRANSFER_STATUS.DISPATCHED, {
        dispatchedBy: currentUser._id,
        dispatchedAt: new Date()
    });

    // 2. Take the goods out of the source warehouse (atomic, can fail if stock ran out)
    try {
        await removeStock({
            productId: transfer.product,
            warehouseId: transfer.fromWarehouse,
            quantity: transfer.quantity,
            userId: currentUser._id,
            type: STOCK_TRANSACTION_TYPE.TRANSFER_OUT,
            referenceType: STOCK_REFERENCE_TYPE.TRANSFER,
            referenceId: transfer._id,
            note: `Transfer ${transfer.transferNumber} dispatched`
        });
    }
    catch (error) {
        // 3. Stock step failed → put the transfer back to APPROVED, then report the error
        await revertStatus(transfer._id, TRANSFER_STATUS.APPROVED, { dispatchedBy: 1, dispatchedAt: 1 });
        throw error;
    }

    await auditStatusChange(transfer, "TRANSFER_DISPATCHED", TRANSFER_STATUS.APPROVED, currentUser._id);

    // Tell the destination warehouse's manager that goods are on the way
    const destination = await Warehouse.findById(transfer.toWarehouse);
    if (destination.manager) {
        await notifyUser(destination.manager, {
            type: NOTIFICATION_TYPE.STOCK_TRANSFER,
            title: "Goods on the way",
            message: `${transfer.transferNumber}: ${transfer.quantity} unit(s) dispatched to ${destination.code}. Confirm when received.`,
            link: transferLink(transfer)
        });
    }

    return populateTransfer(transfer);
};

// PUT /api/transfers/:id/receive  DISPATCHED → RECEIVED, destination quantity += X
const receiveTransfer = async (transferId, currentUser) => {
    const transfer = await moveTransferStatus(transferId, [TRANSFER_STATUS.DISPATCHED], TRANSFER_STATUS.RECEIVED, {
        receivedBy: currentUser._id,
        receivedAt: new Date()
    });

    try {
        await addStock({
            productId: transfer.product,
            warehouseId: transfer.toWarehouse,
            quantity: transfer.quantity,
            userId: currentUser._id,
            type: STOCK_TRANSACTION_TYPE.TRANSFER_IN,
            referenceType: STOCK_REFERENCE_TYPE.TRANSFER,
            referenceId: transfer._id,
            note: `Transfer ${transfer.transferNumber} received`,
            // Goods already on the truck must be receivable even if the product was deactivated
            requireActiveProduct: false
        });
    }
    catch (error) {
        // e.g. destination is full → stays DISPATCHED until space is made
        await revertStatus(transfer._id, TRANSFER_STATUS.DISPATCHED, { receivedBy: 1, receivedAt: 1 });
        throw error;
    }

    await auditStatusChange(transfer, "TRANSFER_RECEIVED", TRANSFER_STATUS.DISPATCHED, currentUser._id);
    await notifyUser(transfer.requestedBy, {
        type: NOTIFICATION_TYPE.STOCK_TRANSFER,
        title: "Transfer received",
        message: `${transfer.transferNumber} was received by ${currentUser.name}.`,
        link: transferLink(transfer)
    });

    return populateTransfer(transfer);
};

// PUT /api/transfers/:id/cancel  REQUESTED or APPROVED → CANCELLED
// (After dispatch the goods have left; the transfer must be received instead.)
const cancelTransfer = async (transferId, reason, currentUser) => {
    const before = await findTransferOrFail(transferId);

    const cancelled = await moveTransferStatus(
        transferId,
        [TRANSFER_STATUS.REQUESTED, TRANSFER_STATUS.APPROVED],
        TRANSFER_STATUS.CANCELLED,
        { cancelledBy: currentUser._id, cancelledAt: new Date(), cancelReason: reason }
    );

    await auditStatusChange(cancelled, "TRANSFER_CANCELLED", before.status, currentUser._id, { reason });

    if (!cancelled.requestedBy.equals(currentUser._id)) {
        await notifyUser(cancelled.requestedBy, {
            type: NOTIFICATION_TYPE.STOCK_TRANSFER,
            title: "Transfer cancelled",
            message: `${cancelled.transferNumber} was cancelled by ${currentUser.name}${reason ? `: ${reason}` : "."}`,
            link: transferLink(cancelled)
        });
    }

    return populateTransfer(cancelled);
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

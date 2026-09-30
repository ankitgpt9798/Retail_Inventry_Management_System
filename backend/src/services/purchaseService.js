const PurchaseOrder = require("../models/PurchaseOrder");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const User = require("../models/User");
const Warehouse = require("../models/Warehouse");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const { PURCHASE_SORT } = require("../utils/sortOptions");
const moveStatus = require("../utils/moveStatus");
const roundMoney = require("../utils/roundMoney");
const {
    ROLES,
    RECORD_STATUS,
    USER_STATUS,
    PURCHASE_STATUS,
    OPEN_PURCHASE_STATUSES,
    STOCK_TRANSACTION_TYPE,
    STOCK_REFERENCE_TYPE,
    NOTIFICATION_TYPE
} = require("../utils/constants");
const { findActiveProduct, findActiveWarehouse, addStock } = require("./inventoryService");
const { getStockTotals } = require("./warehouseService");
const { getNextCode } = require("./counterService");
const { logAction } = require("./auditService");
const { notifyRoles, notifyUser } = require("./notificationService");

// Who is told when a purchase request needs approval
const PURCHASE_MANAGER_ROLES = [ROLES.ADMIN, ROLES.INVENTORY_MANAGER];

// Statuses in which goods can still arrive
const RECEIVABLE_STATUSES = [PURCHASE_STATUS.ORDERED, PURCHASE_STATUS.PARTIALLY_RECEIVED];

// ---------- Pure helpers (no database; unit-tested) ----------

// Sum of quantity × unit cost over all lines
const calculateTotal = (items) => {
    let total = 0;
    for (const item of items) {
        total += item.quantityOrdered * item.unitCost;
    }
    return roundMoney(total);
};

// The status after receiving is worked out from the items, never typed in by a user
const calculateReceiptStatus = (items) => {
    let everythingReceived = true;
    let anythingReceived = false;

    for (const item of items) {
        if (item.quantityReceived < item.quantityOrdered) {
            everythingReceived = false;
        }
        if (item.quantityReceived > 0) {
            anythingReceived = true;
        }
    }

    if (everythingReceived) return PURCHASE_STATUS.RECEIVED;
    if (anythingReceived) return PURCHASE_STATUS.PARTIALLY_RECEIVED;
    return PURCHASE_STATUS.ORDERED;
};

// ---------- Lookups ----------

const findPurchaseOrFail = async (purchaseId) => {
    const purchase = await PurchaseOrder.findById(purchaseId);
    if (!purchase) {
        throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase order not found");
    }
    return purchase;
};

const findActiveSupplier = async (supplierId) => {
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
        throw new AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
    }
    if (supplier.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError(422, "SUPPLIER_INACTIVE", `Supplier "${supplier.name}" is inactive`);
    }
    return supplier;
};

const isSupplierUser = (user) => user.role === ROLES.SUPPLIER;

// Suppliers only see their own company's POs, and only once they were sent (ordered).
// Anything else is reported as "not found", so the portal doesn't reveal that it exists.
const findPurchaseForSupplier = async (purchaseId, supplierUser) => {
    const purchase = await PurchaseOrder.findById(purchaseId);
    const isTheirs = purchase && purchase.supplier.equals(supplierUser.supplier) && purchase.orderedAt;

    if (!isTheirs) {
        throw new AppError(404, "PURCHASE_NOT_FOUND", "Purchase order not found");
    }
    return purchase;
};

const populatePurchase = (purchase) => {
    return purchase.populate([
        { path: "supplier", select: "name email" },
        { path: "warehouse", select: "name code" },
        { path: "items.product", select: "name sku" },
        { path: "requestedBy", select: "name" },
        { path: "approvedBy", select: "name" },
        { path: "rejectedBy", select: "name" },
        { path: "orderedBy", select: "name" },
        { path: "cancelledBy", select: "name" },
        { path: "supplierConfirmedBy", select: "name" }
    ]);
};

// Checks every product and fills in the unit cost from the product when not given
const buildItems = async (items) => {
    const builtItems = [];
    for (const item of items) {
        const product = await findActiveProduct(item.product);
        builtItems.push({
            product: product._id,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost !== undefined ? item.unitCost : product.costPrice
        });
    }
    return builtItems;
};

// Atomic status change (see utils/moveStatus) with a purchase-specific error
const movePurchaseStatus = async (purchaseId, allowedFromStatuses, toStatus, extraFields) => {
    const purchase = await moveStatus(PurchaseOrder, purchaseId, allowedFromStatuses, toStatus, extraFields);

    if (!purchase) {
        const current = await findPurchaseOrFail(purchaseId);
        throw new AppError(
            409,
            "INVALID_PURCHASE_STATUS",
            `Purchase order ${current.poNumber} is ${current.status}; it must be ${allowedFromStatuses.join(" or ")} to do this`
        );
    }
    return purchase;
};

const ensureStatus = (purchase, allowedStatuses, action) => {
    if (!allowedStatuses.includes(purchase.status)) {
        throw new AppError(
            409,
            "INVALID_PURCHASE_STATUS",
            `Purchase order ${purchase.poNumber} is ${purchase.status}; it must be ${allowedStatuses.join(" or ")} to ${action}`
        );
    }
};

const auditPurchase = async (purchase, action, userId, oldValue, newValue, metadata = {}) => {
    await logAction({
        userId,
        action,
        entityType: "PurchaseOrder",
        entityId: purchase._id,
        oldValue,
        newValue,
        metadata: { poNumber: purchase.poNumber, ...metadata }
    });
};

// Tells every ACTIVE portal user of the supplier company
const notifySupplierUsers = async (supplierId, notification) => {
    const supplierUsers = await User.find(
        { role: ROLES.SUPPLIER, supplier: supplierId, status: USER_STATUS.ACTIVE },
        "_id"
    );
    for (const user of supplierUsers) {
        await notifyUser(user._id, notification);
    }
};

const purchaseLink = (purchase) => `/purchases/${purchase._id}`;

// ---------- Reads ----------

// GET /api/purchases
const getPurchases = async ({ status, supplier, warehouse, search, sort = "newest", page, limit }, currentUser) => {
    const filter = {};

    if (isSupplierUser(currentUser)) {
        // The supplier filter is forced to their own company, whatever they asked for
        filter.supplier = currentUser.supplier;
        filter.orderedAt = { $exists: true };
    }
    else if (supplier) {
        filter.supplier = supplier;
    }

    if (status) filter.status = status;
    if (warehouse) filter.warehouse = warehouse;
    if (search) {
        // PO number, or the name of the supplier
        const searchPattern = new RegExp(escapeRegex(search), "i");
        const matchingSuppliers = await Supplier.find({ name: searchPattern }, "_id");
        filter.$or = [{ poNumber: searchPattern }, { supplier: { $in: matchingSuppliers.map((s) => s._id) } }];
    }

    const [purchases, total] = await Promise.all([
        PurchaseOrder.find(filter)
            .populate("supplier", "name")
            .populate("warehouse", "name code")
            .populate("requestedBy", "name")
            .sort(PURCHASE_SORT[sort])
            .skip((page - 1) * limit)
            .limit(limit),
        PurchaseOrder.countDocuments(filter)
    ]);

    return {
        purchases,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

const getPurchaseById = async (purchaseId, currentUser) => {
    const purchase = isSupplierUser(currentUser)
        ? await findPurchaseForSupplier(purchaseId, currentUser)
        : await findPurchaseOrFail(purchaseId);

    return populatePurchase(purchase);
};

// ---------- Create and edit (DRAFT) ----------

// POST /api/purchases → DRAFT (or straight to PENDING with submit: true)
const createPurchase = async (data, currentUser) => {
    const supplier = await findActiveSupplier(data.supplier);
    const warehouse = await findActiveWarehouse(data.warehouse);
    const items = await buildItems(data.items);

    const purchase = await PurchaseOrder.create({
        poNumber: await getNextCode("purchase", "PO"),
        supplier: supplier._id,
        warehouse: warehouse._id,
        items,
        totalAmount: calculateTotal(items),
        expectedDeliveryDate: data.expectedDeliveryDate,
        notes: data.notes,
        requestedBy: currentUser._id
    });

    await auditPurchase(purchase, "PURCHASE_CREATED", currentUser._id, undefined, {
        status: purchase.status,
        supplier: supplier.name,
        warehouse: warehouse.code,
        totalAmount: purchase.totalAmount
    });

    if (data.submit) {
        return submitPurchase(purchase._id, currentUser);
    }
    return populatePurchase(purchase);
};

// PUT /api/purchases/:id — only while DRAFT
const updateDraft = async (purchaseId, updates, currentUser) => {
    const purchase = await findPurchaseOrFail(purchaseId);
    ensureStatus(purchase, [PURCHASE_STATUS.DRAFT], "edit it");

    const changes = {};
    if (updates.supplier) {
        changes.supplier = (await findActiveSupplier(updates.supplier))._id;
    }
    if (updates.warehouse) {
        changes.warehouse = (await findActiveWarehouse(updates.warehouse))._id;
    }
    if (updates.items) {
        changes.items = await buildItems(updates.items);
        changes.totalAmount = calculateTotal(changes.items);
    }
    if (updates.expectedDeliveryDate !== undefined) changes.expectedDeliveryDate = updates.expectedDeliveryDate;
    if (updates.notes !== undefined) changes.notes = updates.notes;

    // Save only if it is STILL a draft (someone may have submitted it meanwhile)
    const updated = await PurchaseOrder.findOneAndUpdate(
        { _id: purchase._id, status: PURCHASE_STATUS.DRAFT },
        { $set: changes },
        { returnDocument: "after" }
    );
    if (!updated) {
        throw new AppError(409, "INVALID_PURCHASE_STATUS", `Purchase order ${purchase.poNumber} is no longer a DRAFT`);
    }

    await auditPurchase(updated, "PURCHASE_UPDATED", currentUser._id, undefined, undefined, {
        changedFields: Object.keys(changes)
    });

    return populatePurchase(updated);
};

// ---------- Approval workflow ----------

// PUT /api/purchases/:id/submit  DRAFT → PENDING
const submitPurchase = async (purchaseId, currentUser) => {
    const purchase = await movePurchaseStatus(purchaseId, [PURCHASE_STATUS.DRAFT], PURCHASE_STATUS.PENDING);
    await auditPurchase(purchase, "PURCHASE_SUBMITTED", currentUser._id, { status: PURCHASE_STATUS.DRAFT }, { status: purchase.status });

    await populatePurchase(purchase);
    await notifyRoles(PURCHASE_MANAGER_ROLES, {
        type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
        title: "Purchase request needs approval",
        message: `${purchase.poNumber}: ${purchase.items.length} item(s) from ${purchase.supplier.name}, ` +
            `total ${purchase.totalAmount}, needs approval.`,
        link: purchaseLink(purchase)
    }, currentUser._id);

    return purchase;
};

// PUT /api/purchases/:id/approve  PENDING → APPROVED
const approvePurchase = async (purchaseId, currentUser) => {
    const purchase = await findPurchaseOrFail(purchaseId);

    // Segregation of duties: someone else must approve spending
    if (purchase.requestedBy.equals(currentUser._id)) {
        throw new AppError(403, "SELF_APPROVAL_NOT_ALLOWED", "You cannot approve your own purchase request");
    }
    ensureStatus(purchase, [PURCHASE_STATUS.PENDING], "approve it");
    await findActiveSupplier(purchase.supplier);

    const approved = await movePurchaseStatus(purchase._id, [PURCHASE_STATUS.PENDING], PURCHASE_STATUS.APPROVED, {
        approvedBy: currentUser._id,
        approvedAt: new Date()
    });

    await auditPurchase(approved, "PURCHASE_APPROVED", currentUser._id, { status: PURCHASE_STATUS.PENDING }, { status: approved.status });
    await notifyUser(approved.requestedBy, {
        type: NOTIFICATION_TYPE.PURCHASE_APPROVED,
        title: "Purchase approved",
        message: `${approved.poNumber} was approved by ${currentUser.name} and can be sent to the supplier.`,
        link: purchaseLink(approved)
    });

    return populatePurchase(approved);
};

// PUT /api/purchases/:id/reject  PENDING → REJECTED
const rejectPurchase = async (purchaseId, reason, currentUser) => {
    const rejected = await movePurchaseStatus(purchaseId, [PURCHASE_STATUS.PENDING], PURCHASE_STATUS.REJECTED, {
        rejectedBy: currentUser._id,
        rejectedAt: new Date(),
        rejectionReason: reason
    });

    await auditPurchase(rejected, "PURCHASE_REJECTED", currentUser._id, { status: PURCHASE_STATUS.PENDING }, { status: rejected.status, reason });
    await notifyUser(rejected.requestedBy, {
        type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
        title: "Purchase rejected",
        message: `${rejected.poNumber} was rejected by ${currentUser.name}: ${reason}`,
        link: purchaseLink(rejected)
    });

    return populatePurchase(rejected);
};

// PUT /api/purchases/:id/order  APPROVED → ORDERED (sent to the supplier)
const orderPurchase = async (purchaseId, currentUser) => {
    const purchase = await findPurchaseOrFail(purchaseId);
    ensureStatus(purchase, [PURCHASE_STATUS.APPROVED], "send it to the supplier");
    await findActiveSupplier(purchase.supplier);

    const ordered = await movePurchaseStatus(purchase._id, [PURCHASE_STATUS.APPROVED], PURCHASE_STATUS.ORDERED, {
        orderedBy: currentUser._id,
        orderedAt: new Date()
    });

    await auditPurchase(ordered, "PURCHASE_ORDERED", currentUser._id, { status: PURCHASE_STATUS.APPROVED }, { status: ordered.status });
    await notifySupplierUsers(ordered.supplier, {
        type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
        title: "New purchase order",
        message: `New purchase order ${ordered.poNumber} with ${ordered.items.length} item(s). Please confirm it.`,
        link: purchaseLink(ordered)
    });

    return populatePurchase(ordered);
};

// ---------- Supplier portal ----------

// PUT /api/purchases/:id/confirm — the supplier accepts the order
const confirmPurchase = async (purchaseId, { expectedDeliveryDate, deliveryNote }, supplierUser) => {
    const purchase = await findPurchaseForSupplier(purchaseId, supplierUser);

    if (purchase.supplierConfirmedAt) {
        throw new AppError(409, "ALREADY_CONFIRMED", `Purchase order ${purchase.poNumber} was already confirmed`);
    }
    ensureStatus(purchase, [PURCHASE_STATUS.ORDERED], "confirm it");

    purchase.supplierConfirmedAt = new Date();
    purchase.supplierConfirmedBy = supplierUser._id;
    if (expectedDeliveryDate !== undefined) purchase.expectedDeliveryDate = expectedDeliveryDate;
    if (deliveryNote !== undefined) purchase.deliveryNote = deliveryNote;
    await purchase.save();

    await auditPurchase(purchase, "PURCHASE_CONFIRMED_BY_SUPPLIER", supplierUser._id, undefined, {
        expectedDeliveryDate: purchase.expectedDeliveryDate,
        deliveryNote: purchase.deliveryNote
    });
    await notifyUser(purchase.requestedBy, {
        type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
        title: "Supplier confirmed order",
        message: `${purchase.poNumber} was confirmed by the supplier.`,
        link: purchaseLink(purchase)
    });

    return populatePurchase(purchase);
};

// PUT /api/purchases/:id/delivery — the supplier updates delivery date / note
const updateDelivery = async (purchaseId, { expectedDeliveryDate, deliveryNote }, supplierUser) => {
    const purchase = await findPurchaseForSupplier(purchaseId, supplierUser);
    ensureStatus(purchase, RECEIVABLE_STATUSES, "update delivery details");

    const oldValue = { expectedDeliveryDate: purchase.expectedDeliveryDate, deliveryNote: purchase.deliveryNote };
    if (expectedDeliveryDate !== undefined) purchase.expectedDeliveryDate = expectedDeliveryDate;
    if (deliveryNote !== undefined) purchase.deliveryNote = deliveryNote;
    await purchase.save();

    await auditPurchase(purchase, "PURCHASE_DELIVERY_UPDATED", supplierUser._id, oldValue, {
        expectedDeliveryDate: purchase.expectedDeliveryDate,
        deliveryNote: purchase.deliveryNote
    });
    await notifyUser(purchase.requestedBy, {
        type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
        title: "Delivery details updated",
        message: `The supplier updated delivery details for ${purchase.poNumber}.`,
        link: purchaseLink(purchase)
    });

    return populatePurchase(purchase);
};

// ---------- Receiving goods ----------

// If adding stock fails part-way, take the not-yet-stocked lines back off the PO,
// so the PO always matches the stock that was really added.
const undoReceiptLines = async (purchaseId, lines) => {
    const purchase = await PurchaseOrder.findById(purchaseId);
    for (const line of lines) {
        const item = purchase.items.id(line.itemId);
        item.quantityReceived -= line.quantity;
    }
    if (RECEIVABLE_STATUSES.includes(purchase.status) || purchase.status === PURCHASE_STATUS.RECEIVED) {
        purchase.status = calculateReceiptStatus(purchase.items);
        if (purchase.status !== PURCHASE_STATUS.RECEIVED) {
            purchase.receivedAt = undefined;
        }
    }
    await purchase.save();
};

// PUT /api/purchases/:id/receive  { items: [{ product, quantity }] }
const receivePurchase = async (purchaseId, lines, currentUser) => {
    const purchase = await findPurchaseOrFail(purchaseId);
    ensureStatus(purchase, RECEIVABLE_STATUSES, "receive goods");

    // SKUs are only needed for friendly messages
    const products = await Product.find({ _id: { $in: purchase.items.map((item) => item.product) } }, "sku");
    const skuById = {};
    for (const product of products) {
        skuById[product._id.toString()] = product.sku;
    }

    // 1. Check every line against what is still outstanding
    const receipt = [];
    let totalUnits = 0;
    for (const line of lines) {
        const item = purchase.items.find((poItem) => poItem.product.toString() === line.product);
        if (!item) {
            throw new AppError(422, "PRODUCT_NOT_IN_PURCHASE", `A product in this delivery is not part of ${purchase.poNumber}`);
        }

        const outstanding = item.quantityOrdered - item.quantityReceived;
        if (line.quantity > outstanding) {
            throw new AppError(
                400,
                "OVER_RECEIPT",
                `Only ${outstanding} of ${skuById[line.product]} are still outstanding on ${purchase.poNumber}`
            );
        }

        receipt.push({ itemId: item._id, productId: item.product, quantity: line.quantity });
        totalUnits += line.quantity;
    }

    // 2. The warehouse must have room for the WHOLE delivery (so we don't fail half-way)
    const warehouse = await Warehouse.findById(purchase.warehouse);
    const { totalQuantity } = await getStockTotals(warehouse._id);
    if (totalQuantity + totalUnits > warehouse.capacity) {
        throw new AppError(
            409,
            "CAPACITY_EXCEEDED",
            `${warehouse.code} can hold ${warehouse.capacity} units and has ${totalQuantity}; ` +
            `this delivery of ${totalUnits} unit(s) will not fit`
        );
    }

    // 3. Work out the new quantities and status, then save them with OPTIMISTIC LOCKING:
    //    only if the PO's version (__v) is still the one we read. If someone recorded
    //    another delivery in the meantime, the version changed and nothing is saved.
    const newItems = purchase.items.map((item) => {
        const line = receipt.find((receiptLine) => receiptLine.itemId.equals(item._id));
        return {
            _id: item._id,
            product: item.product,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            quantityReceived: item.quantityReceived + (line ? line.quantity : 0)
        };
    });
    const newStatus = calculateReceiptStatus(newItems);
    const changes = { items: newItems, status: newStatus };
    if (newStatus === PURCHASE_STATUS.RECEIVED) {
        changes.receivedAt = new Date();
    }

    const updated = await PurchaseOrder.findOneAndUpdate(
        { _id: purchase._id, __v: purchase.__v, status: { $in: RECEIVABLE_STATUSES } },
        { $set: changes, $inc: { __v: 1 } },
        { returnDocument: "after" }
    );
    if (!updated) {
        throw new AppError(
            409,
            "PURCHASE_CHANGED",
            `Purchase order ${purchase.poNumber} was changed by someone else. Reload it and try again.`
        );
    }

    // 4. Put the goods into stock, line by line (Rule 3 + Rule 9 via addStock)
    for (let index = 0; index < receipt.length; index++) {
        const line = receipt[index];
        try {
            await addStock({
                productId: line.productId,
                warehouseId: purchase.warehouse,
                quantity: line.quantity,
                userId: currentUser._id,
                type: STOCK_TRANSACTION_TYPE.STOCK_IN,
                referenceType: STOCK_REFERENCE_TYPE.PURCHASE_ORDER,
                referenceId: purchase._id,
                note: `Received on ${purchase.poNumber}`,
                // Goods the supplier already delivered must be accepted
                requireActiveProduct: false
            });
        }
        catch (error) {
            await undoReceiptLines(purchase._id, receipt.slice(index));
            throw error;
        }
    }

    const receivedLines = receipt.map((line) => ({ sku: skuById[line.productId.toString()], quantity: line.quantity }));
    await auditPurchase(updated, "PURCHASE_RECEIVED", currentUser._id, { status: purchase.status }, { status: updated.status }, {
        lines: receivedLines
    });
    await notifyUser(updated.requestedBy, {
        type: NOTIFICATION_TYPE.PURCHASE_RECEIVED,
        title: "Goods received",
        message: `${updated.poNumber}: ${totalUnits} unit(s) received at ${warehouse.code}. Status: ${updated.status}.`,
        link: purchaseLink(updated)
    });

    return populatePurchase(updated);
};

// ---------- Cancel ----------

// PUT /api/purchases/:id/cancel — from any open status.
// For PARTIALLY_RECEIVED it means "cancel the rest": received goods stay in stock.
const cancelPurchase = async (purchaseId, reason, currentUser) => {
    const before = await findPurchaseOrFail(purchaseId);

    const cancelled = await movePurchaseStatus(purchaseId, OPEN_PURCHASE_STATUSES, PURCHASE_STATUS.CANCELLED, {
        cancelledBy: currentUser._id,
        cancelledAt: new Date(),
        cancelReason: reason
    });

    await auditPurchase(cancelled, "PURCHASE_CANCELLED", currentUser._id, { status: before.status }, { status: cancelled.status, reason });

    // The supplier only needs to know if the order had already been sent to them
    if (cancelled.orderedAt) {
        await notifySupplierUsers(cancelled.supplier, {
            type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
            title: "Purchase order cancelled",
            message: `${cancelled.poNumber} was cancelled${reason ? `: ${reason}` : "."}`,
            link: purchaseLink(cancelled)
        });
    }
    if (!cancelled.requestedBy.equals(currentUser._id)) {
        await notifyUser(cancelled.requestedBy, {
            type: NOTIFICATION_TYPE.PURCHASE_UPDATE,
            title: "Purchase cancelled",
            message: `${cancelled.poNumber} was cancelled by ${currentUser.name}${reason ? `: ${reason}` : "."}`,
            link: purchaseLink(cancelled)
        });
    }

    return populatePurchase(cancelled);
};

module.exports = {
    calculateTotal,
    calculateReceiptStatus,
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

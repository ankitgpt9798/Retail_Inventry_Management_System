const Supplier = require("../models/Supplier");
const User = require("../models/User");
const PurchaseOrder = require("../models/PurchaseOrder");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const { ROLES, RECORD_STATUS, USER_STATUS, OPEN_PURCHASE_STATUSES } = require("../utils/constants");
const { logAction, getChanges } = require("./auditService");

// ---------- Helpers ----------

const findSupplierOrFail = async (supplierId) => {
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
        throw new AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
    }
    return supplier;
};

// The email identifies the supplier. (The model saves emails in lowercase.)
const ensureEmailIsFree = async (email, exceptSupplierId) => {
    const existingSupplier = await Supplier.findOne({ email: email.toLowerCase() });
    if (existingSupplier && !existingSupplier._id.equals(exceptSupplierId)) {
        throw new AppError(409, "SUPPLIER_EMAIL_EXISTS", `Email is already used by supplier "${existingSupplier.name}"`);
    }
};

// Don't stop working with a supplier who still has orders in progress
const ensureNoOpenPurchases = async (supplierId) => {
    const openPurchaseCount = await PurchaseOrder.countDocuments({
        supplier: supplierId,
        status: { $in: OPEN_PURCHASE_STATUSES }
    });

    if (openPurchaseCount > 0) {
        throw new AppError(
            409,
            "SUPPLIER_HAS_OPEN_PURCHASES",
            `Cannot deactivate: ${openPurchaseCount} open purchase order(s) with this supplier. Receive or cancel them first.`
        );
    }
};

// A supplier we no longer work with must not be able to use the supplier portal.
// Returns how many login users were deactivated.
const deactivateSupplierUsers = async (supplier, currentUser) => {
    const supplierUsers = await User.find({
        role: ROLES.SUPPLIER,
        supplier: supplier._id,
        status: USER_STATUS.ACTIVE
    });

    for (const user of supplierUsers) {
        user.status = USER_STATUS.INACTIVE;
        await user.save();

        await logAction({
            userId: currentUser._id,
            action: "USER_DEACTIVATED",
            entityType: "User",
            entityId: user._id,
            oldValue: { status: USER_STATUS.ACTIVE },
            newValue: { status: USER_STATUS.INACTIVE },
            metadata: { reason: `Supplier "${supplier.name}" was deactivated` }
        });
    }

    return supplierUsers.length;
};

const getAuditFields = (supplier) => ({
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    city: supplier.city,
    status: supplier.status
});

// ---------- Service functions ----------

// GET /api/suppliers
const getSuppliers = async ({ search, city, status, page, limit }) => {
    const filter = {};

    if (search) {
        const searchPattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ name: searchPattern }, { contactPerson: searchPattern }, { email: searchPattern }];
    }
    if (city) {
        filter.city = new RegExp(`^${escapeRegex(city)}$`, "i");
    }
    if (status) {
        filter.status = status;
    }

    const [suppliers, total] = await Promise.all([
        Supplier.find(filter)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Supplier.countDocuments(filter)
    ]);

    return {
        suppliers,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

// GET /api/suppliers/:id — the supplier and the people who log in for it
const getSupplierById = async (supplierId) => {
    const supplier = await findSupplierOrFail(supplierId);
    const users = await User.find({ role: ROLES.SUPPLIER, supplier: supplier._id }, "name email status lastLoginAt")
        .sort({ name: 1 });

    return { supplier, users };
};

const createSupplier = async (data, currentUser) => {
    await ensureEmailIsFree(data.email);

    const supplier = await Supplier.create(data);

    await logAction({
        userId: currentUser._id,
        action: "SUPPLIER_CREATED",
        entityType: "Supplier",
        entityId: supplier._id,
        newValue: getAuditFields(supplier)
    });

    return supplier;
};

// Returns { supplier, deactivatedUserCount }
const updateSupplier = async (supplierId, updates, currentUser) => {
    const supplier = await findSupplierOrFail(supplierId);

    if (updates.email) {
        await ensureEmailIsFree(updates.email, supplier._id);
    }

    const isDeactivating = updates.status === RECORD_STATUS.INACTIVE && supplier.status === RECORD_STATUS.ACTIVE;
    if (isDeactivating) {
        await ensureNoOpenPurchases(supplier._id);
    }

    const before = getAuditFields(supplier);
    supplier.set(updates);
    await supplier.save();

    const { oldValue, newValue } = getChanges(before, getAuditFields(supplier));
    if (Object.keys(newValue).length > 0) {
        await logAction({
            userId: currentUser._id,
            action: "SUPPLIER_UPDATED",
            entityType: "Supplier",
            entityId: supplier._id,
            oldValue,
            newValue
        });
    }

    let deactivatedUserCount = 0;
    if (isDeactivating) {
        deactivatedUserCount = await deactivateSupplierUsers(supplier, currentUser);
    }

    return { supplier, deactivatedUserCount };
};

// DELETE /api/suppliers/:id — soft delete. Returns { supplier, deactivatedUserCount }
const deactivateSupplier = async (supplierId, currentUser) => {
    const supplier = await findSupplierOrFail(supplierId);

    if (supplier.status === RECORD_STATUS.INACTIVE) {
        return { supplier, deactivatedUserCount: 0 };
    }

    await ensureNoOpenPurchases(supplier._id);

    supplier.status = RECORD_STATUS.INACTIVE;
    await supplier.save();

    await logAction({
        userId: currentUser._id,
        action: "SUPPLIER_DEACTIVATED",
        entityType: "Supplier",
        entityId: supplier._id,
        oldValue: { status: RECORD_STATUS.ACTIVE },
        newValue: { status: RECORD_STATUS.INACTIVE }
    });

    const deactivatedUserCount = await deactivateSupplierUsers(supplier, currentUser);

    return { supplier, deactivatedUserCount };
};

module.exports = { getSuppliers, getSupplierById, createSupplier, updateSupplier, deactivateSupplier };

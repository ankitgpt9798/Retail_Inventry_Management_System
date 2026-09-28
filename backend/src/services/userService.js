const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Supplier = require("../models/Supplier");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const { ROLES, USER_STATUS } = require("../utils/constants");
const { hashPassword } = require("./authService");
const { logAction } = require("./auditService");

// ---------- Small helpers used by the functions below ----------

const findUserOrFail = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    return user;
};

// exceptUserId: when editing a user, their own current email is of course allowed
const ensureEmailIsFree = async (email, exceptUserId) => {
    const existingUser = await User.findOne({ email });
    if (existingUser && !existingUser._id.equals(exceptUserId)) {
        throw new AppError(409, "EMAIL_EXISTS", "An account with this email already exists");
    }
};

// Only SUPPLIER users are linked to a supplier company.
// Returns the supplier id to store, or null for every other role.
const resolveSupplierLink = async (role, supplierId) => {
    if (role !== ROLES.SUPPLIER) {
        return null;
    }
    if (!supplierId) {
        throw new AppError(422, "SUPPLIER_REQUIRED", "A SUPPLIER user must be linked to a supplier");
    }
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
        throw new AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
    }
    return supplier._id;
};

// The fields we record in the audit log before/after a change (never the password)
const getAuditFields = (user) => ({
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    supplier: user.supplier ? user.supplier.toString() : null
});

// ---------- Admin: user management ----------

// GET /api/users?search=&role=&status=&page=&limit=
const getUsers = async ({ search, role, status, page, limit }) => {
    // Build the MongoDB filter only from the options that were actually given
    const filter = {};
    if (role) {
        filter.role = role;
    }
    if (status) {
        filter.status = status;
    }
    if (search) {
        // "i" = case-insensitive; match the text anywhere in name OR email
        const searchPattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ name: searchPattern }, { email: searchPattern }];
    }

    // Run both queries at the same time: one page of users + the total count
    const [users, total] = await Promise.all([
        User.find(filter)
            .populate("supplier", "name")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        User.countDocuments(filter)
    ]);

    return {
        users,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const getUserById = async (userId) => {
    const user = await findUserOrFail(userId);
    await user.populate("supplier", "name");
    return user;
};

// Admin-created users are ACTIVE straight away and may have any role
const createUser = async (data, adminUser) => {
    await ensureEmailIsFree(data.email);
    const supplierId = await resolveSupplierLink(data.role, data.supplier);

    const user = await User.create({
        name: data.name,
        email: data.email,
        password: await hashPassword(data.password),
        phone: data.phone,
        role: data.role,
        status: USER_STATUS.ACTIVE,
        supplier: supplierId
    });

    await logAction({
        userId: adminUser._id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user._id,
        newValue: getAuditFields(user)
    });

    return user;
};

// Used to approve users (status ACTIVE), assign roles and edit details
const updateUser = async (userId, updates, adminUser) => {
    const user = await findUserOrFail(userId);
    const isEditingSelf = user._id.equals(adminUser._id);

    // Rule: admins cannot change their own role or status.
    // This also guarantees there is always at least one active admin.
    if (isEditingSelf && updates.role && updates.role !== user.role) {
        throw new AppError(400, "CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role");
    }
    if (isEditingSelf && updates.status && updates.status !== user.status) {
        throw new AppError(400, "CANNOT_CHANGE_OWN_STATUS", "You cannot change your own account status");
    }

    if (updates.email) {
        await ensureEmailIsFree(updates.email, user._id);
    }

    const oldValue = getAuditFields(user);

    // Work out the final role and supplier link after this update
    const newRole = updates.role || user.role;
    const newSupplierId = updates.supplier !== undefined ? updates.supplier : user.supplier;

    if (updates.name !== undefined) user.name = updates.name;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.status !== undefined) user.status = updates.status;
    user.role = newRole;
    user.supplier = await resolveSupplierLink(newRole, newSupplierId);

    await user.save();

    await logAction({
        userId: adminUser._id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: user._id,
        oldValue,
        newValue: getAuditFields(user)
    });

    await user.populate("supplier", "name");
    return user;
};

// DELETE /api/users/:id — a "soft delete": the user stays in the database
// (orders and audit logs still point to them) but can no longer log in.
const deactivateUser = async (userId, adminUser) => {
    const user = await findUserOrFail(userId);

    if (user._id.equals(adminUser._id)) {
        throw new AppError(400, "CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account");
    }

    if (user.status !== USER_STATUS.INACTIVE) {
        const oldStatus = user.status;
        user.status = USER_STATUS.INACTIVE;
        await user.save();

        await logAction({
            userId: adminUser._id,
            action: "USER_DEACTIVATED",
            entityType: "User",
            entityId: user._id,
            oldValue: { status: oldStatus },
            newValue: { status: user.status }
        });
    }

    return user;
};

// Admin sets a new password for a user who forgot theirs
const resetUserPassword = async (userId, newPassword, adminUser) => {
    const user = await findUserOrFail(userId);

    user.password = await hashPassword(newPassword);
    // Log the user out on every device (their old tokens have the old version)
    user.tokenVersion += 1;
    await user.save();

    await logAction({
        userId: adminUser._id,
        action: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: user._id
    });

    return user;
};

// ---------- Any logged-in user: own profile ----------

// currentUser is req.user (already loaded by the protect middleware)
const updateProfile = async (currentUser, updates) => {
    const oldValue = { name: currentUser.name, phone: currentUser.phone };

    if (updates.name !== undefined) currentUser.name = updates.name;
    if (updates.phone !== undefined) currentUser.phone = updates.phone;
    await currentUser.save();

    await logAction({
        userId: currentUser._id,
        action: "PROFILE_UPDATED",
        entityType: "User",
        entityId: currentUser._id,
        oldValue,
        newValue: { name: currentUser.name, phone: currentUser.phone }
    });

    return currentUser;
};

const changeOwnPassword = async (userId, currentPassword, newPassword) => {
    const user = await User.findById(userId).select("+password");

    // Asking for the current password stops someone who finds an
    // unlocked, logged-in computer from taking over the account
    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordCorrect) {
        throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
    }

    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
        throw new AppError(400, "SAME_PASSWORD", "New password must be different from the current password");
    }

    user.password = await hashPassword(newPassword);
    user.tokenVersion += 1;
    await user.save();

    await logAction({
        userId: user._id,
        action: "PASSWORD_CHANGED",
        entityType: "User",
        entityId: user._id
    });
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deactivateUser,
    resetUserPassword,
    updateProfile,
    changeOwnPassword
};

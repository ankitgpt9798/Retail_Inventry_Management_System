const Category = require("../models/Category");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const { RECORD_STATUS } = require("../utils/constants");
const { logAction, getChanges } = require("./auditService");

// ---------- Helpers ----------

const findCategoryOrFail = async (categoryId) => {
    const category = await Category.findById(categoryId);
    if (!category) {
        throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    return category;
};

// Names are compared ignoring case, so "Electronics" and "electronics" can't both exist.
// ^ and $ mean "the whole name", not just part of it.
const ensureNameIsFree = async (name, exceptCategoryId) => {
    const sameName = new RegExp(`^${escapeRegex(name)}$`, "i");
    const existingCategory = await Category.findOne({ name: sameName });

    if (existingCategory && !existingCategory._id.equals(exceptCategoryId)) {
        throw new AppError(409, "CATEGORY_EXISTS", `Category "${existingCategory.name}" already exists`);
    }
};

// A category can't be hidden while active products still belong to it
const ensureNoActiveProducts = async (categoryId) => {
    const activeProductCount = await Product.countDocuments({
        category: categoryId,
        status: RECORD_STATUS.ACTIVE
    });

    if (activeProductCount > 0) {
        throw new AppError(
            409,
            "CATEGORY_IN_USE",
            `Cannot deactivate: ${activeProductCount} active product(s) use this category. Move or deactivate them first.`
        );
    }
};

const getAuditFields = (category) => ({
    name: category.name,
    description: category.description,
    status: category.status
});

// ---------- Service functions ----------

// GET /api/categories
const getCategories = async ({ search, status, page, limit }) => {
    const filter = {};
    if (status) {
        filter.status = status;
    }
    if (search) {
        filter.name = new RegExp(escapeRegex(search), "i");
    }

    const [categories, total] = await Promise.all([
        Category.find(filter)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Category.countDocuments(filter)
    ]);

    return {
        categories,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

const createCategory = async (data, currentUser) => {
    await ensureNameIsFree(data.name);

    const category = await Category.create({
        name: data.name,
        description: data.description
    });

    await logAction({
        userId: currentUser._id,
        action: "CATEGORY_CREATED",
        entityType: "Category",
        entityId: category._id,
        newValue: getAuditFields(category)
    });

    return category;
};

const updateCategory = async (categoryId, updates, currentUser) => {
    const category = await findCategoryOrFail(categoryId);

    if (updates.name) {
        await ensureNameIsFree(updates.name, category._id);
    }
    if (updates.status === RECORD_STATUS.INACTIVE && category.status === RECORD_STATUS.ACTIVE) {
        await ensureNoActiveProducts(category._id);
    }

    const before = getAuditFields(category);
    category.set(updates);
    await category.save();

    const { oldValue, newValue } = getChanges(before, getAuditFields(category));
    await logAction({
        userId: currentUser._id,
        action: "CATEGORY_UPDATED",
        entityType: "Category",
        entityId: category._id,
        oldValue,
        newValue
    });

    return category;
};

// DELETE /api/categories/:id — soft delete
const deactivateCategory = async (categoryId, currentUser) => {
    const category = await findCategoryOrFail(categoryId);

    if (category.status === RECORD_STATUS.INACTIVE) {
        return category;
    }

    await ensureNoActiveProducts(category._id);

    category.status = RECORD_STATUS.INACTIVE;
    await category.save();

    await logAction({
        userId: currentUser._id,
        action: "CATEGORY_DEACTIVATED",
        entityType: "Category",
        entityId: category._id,
        oldValue: { status: RECORD_STATUS.ACTIVE },
        newValue: { status: RECORD_STATUS.INACTIVE }
    });

    return category;
};

module.exports = { getCategories, createCategory, updateCategory, deactivateCategory };

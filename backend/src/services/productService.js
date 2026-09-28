const Product = require("../models/Product");
const Category = require("../models/Category");
const AppError = require("../utils/AppError");
const escapeRegex = require("../utils/escapeRegex");
const { RECORD_STATUS } = require("../utils/constants");
const { logAction, getChanges } = require("./auditService");

// Which fields of the category to include when showing a product
const CATEGORY_FIELDS = "name status";

// Maps the ?sort= option to a MongoDB sort object
const SORT_BY = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { name: 1 },
    price_low: { sellingPrice: 1 },
    price_high: { sellingPrice: -1 }
};

// ---------- Helpers ----------

const findProductOrFail = async (productId) => {
    const product = await Product.findById(productId);
    if (!product) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    return product;
};

// Products may only be placed in a category that exists and is ACTIVE
const ensureCategoryIsActive = async (categoryId) => {
    const category = await Category.findById(categoryId);
    if (!category) {
        throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    if (category.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError(422, "CATEGORY_INACTIVE", `Category "${category.name}" is inactive`);
    }
};

const ensureSkuIsFree = async (sku, exceptProductId) => {
    // The model stores SKUs in uppercase, so we search in uppercase too
    const existingProduct = await Product.findOne({ sku: sku.toUpperCase() });
    if (existingProduct && !existingProduct._id.equals(exceptProductId)) {
        throw new AppError(409, "SKU_EXISTS", `SKU ${existingProduct.sku} is already used by "${existingProduct.name}"`);
    }
};

const ensureBarcodeIsFree = async (barcode, exceptProductId) => {
    const existingProduct = await Product.findOne({ barcode });
    if (existingProduct && !existingProduct._id.equals(exceptProductId)) {
        throw new AppError(409, "BARCODE_EXISTS", `Barcode is already used by "${existingProduct.name}"`);
    }
};

const getAuditFields = (product) => ({
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    brand: product.brand,
    description: product.description,
    category: product.category ? product.category.toString() : null,
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    taxRate: product.taxRate,
    imageUrl: product.imageUrl,
    reorderLevel: product.reorderLevel,
    status: product.status
});

// ---------- Service functions ----------

// GET /api/products
const getProducts = async ({ search, category, status, brand, minPrice, maxPrice, sort, page, limit }) => {
    const filter = {};

    if (search) {
        // Match the text anywhere in name, SKU, barcode or brand
        const searchPattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [
            { name: searchPattern },
            { sku: searchPattern },
            { barcode: searchPattern },
            { brand: searchPattern }
        ];
    }
    if (category) {
        filter.category = category;
    }
    if (status) {
        filter.status = status;
    }
    if (brand) {
        filter.brand = new RegExp(`^${escapeRegex(brand)}$`, "i");
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
        // $gte = greater than or equal, $lte = less than or equal
        filter.sellingPrice = {};
        if (minPrice !== undefined) filter.sellingPrice.$gte = minPrice;
        if (maxPrice !== undefined) filter.sellingPrice.$lte = maxPrice;
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate("category", CATEGORY_FIELDS)
            .sort(SORT_BY[sort])
            .skip((page - 1) * limit)
            .limit(limit),
        Product.countDocuments(filter)
    ]);

    return {
        products,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

const getProductById = async (productId) => {
    const product = await findProductOrFail(productId);
    await product.populate("category", CATEGORY_FIELDS);
    return product;
};

const createProduct = async (data, currentUser) => {
    await ensureCategoryIsActive(data.category);
    await ensureSkuIsFree(data.sku);
    if (data.barcode) {
        await ensureBarcodeIsFree(data.barcode);
    }

    const product = await Product.create({
        ...data,
        // An empty barcode/image means "none". Saving "" would make two
        // products without a barcode count as duplicates of each other.
        barcode: data.barcode || undefined,
        imageUrl: data.imageUrl || undefined,
        createdBy: currentUser._id
    });

    await logAction({
        userId: currentUser._id,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: product._id,
        newValue: getAuditFields(product)
    });

    await product.populate("category", CATEGORY_FIELDS);
    return product;
};

const updateProduct = async (productId, updates, currentUser) => {
    const product = await findProductOrFail(productId);

    if (updates.sku) {
        await ensureSkuIsFree(updates.sku, product._id);
    }
    if (updates.barcode) {
        await ensureBarcodeIsFree(updates.barcode, product._id);
    }

    // The category must be usable if the product moves to it, or comes back to life in it
    const isMovingCategory = updates.category && updates.category !== product.category.toString();
    const isReactivating = updates.status === RECORD_STATUS.ACTIVE && product.status !== RECORD_STATUS.ACTIVE;
    if (isMovingCategory || isReactivating) {
        await ensureCategoryIsActive(updates.category || product.category);
    }

    // "" means "remove it" (setting undefined removes the field in MongoDB)
    if (updates.barcode === "") updates.barcode = undefined;
    if (updates.imageUrl === "") updates.imageUrl = undefined;

    const before = getAuditFields(product);
    // set() copies every field from updates onto the product document
    product.set(updates);
    await product.save();

    const { oldValue, newValue } = getChanges(before, getAuditFields(product));
    if (Object.keys(newValue).length > 0) {
        await logAction({
            userId: currentUser._id,
            action: "PRODUCT_UPDATED",
            entityType: "Product",
            entityId: product._id,
            oldValue,
            newValue
        });
    }

    await product.populate("category", CATEGORY_FIELDS);
    return product;
};

// DELETE /api/products/:id — soft delete
const deactivateProduct = async (productId, currentUser) => {
    const product = await findProductOrFail(productId);

    if (product.status !== RECORD_STATUS.INACTIVE) {
        product.status = RECORD_STATUS.INACTIVE;
        await product.save();

        await logAction({
            userId: currentUser._id,
            action: "PRODUCT_DEACTIVATED",
            entityType: "Product",
            entityId: product._id,
            oldValue: { status: RECORD_STATUS.ACTIVE },
            newValue: { status: RECORD_STATUS.INACTIVE }
        });
    }

    await product.populate("category", CATEGORY_FIELDS);
    return product;
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, deactivateProduct };

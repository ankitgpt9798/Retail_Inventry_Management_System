const { z } = require("zod");
const { RECORD_STATUS } = require("../utils/constants");
const { objectIdSchema, paginationSchema, searchSchema } = require("./commonValidators");

// Money: not negative, rounded to 2 decimals (so 19.999 is stored as 20)
const moneySchema = (label) =>
    z
        .number({ error: `${label} must be a number` })
        .min(0, `${label} cannot be negative`)
        .max(10000000, `${label} is too large`)
        .transform((value) => Math.round(value * 100) / 100);

// Only http/https links, so values like "javascript:..." can never be saved
const imageUrlSchema = z.union([
    z.url({ protocol: /^https?$/, error: "Image URL must start with http:// or https://" }),
    z.literal("") // empty string = remove the image
]);

const statusSchema = z.enum(Object.values(RECORD_STATUS), { error: "Status must be ACTIVE or INACTIVE" });

// All product fields. Required/optional is decided below for create vs update.
const productFields = {
    name: z
        .string({ error: "Product name is required" })
        .trim()
        .min(2, "Product name must be at least 2 characters")
        .max(200, "Product name must be at most 200 characters"),
    // Letters, numbers and dashes, e.g. "LAP-001". Saved in uppercase by the model.
    sku: z
        .string({ error: "SKU is required" })
        .trim()
        .min(2, "SKU must be at least 2 characters")
        .max(50, "SKU must be at most 50 characters")
        .regex(/^[A-Za-z0-9-]+$/, "SKU can only contain letters, numbers and dashes"),
    // Empty string = no barcode
    barcode: z
        .string()
        .trim()
        .max(50, "Barcode must be at most 50 characters")
        .regex(/^[A-Za-z0-9-]*$/, "Barcode can only contain letters, numbers and dashes"),
    brand: z.string().trim().max(100, "Brand must be at most 100 characters"),
    description: z.string().trim().max(2000, "Description must be at most 2000 characters"),
    category: objectIdSchema,
    costPrice: moneySchema("Cost price"),
    sellingPrice: moneySchema("Selling price"),
    taxRate: z
        .number({ error: "Tax rate must be a number" })
        .min(0, "Tax rate cannot be negative")
        .max(100, "Tax rate cannot be more than 100"),
    imageUrl: imageUrlSchema,
    reorderLevel: z
        .number({ error: "Reorder level must be a number" })
        .int("Reorder level must be a whole number")
        .min(0, "Reorder level cannot be negative")
};

// POST /api/products
const createProductSchema = z.object({
    name: productFields.name,
    sku: productFields.sku,
    barcode: productFields.barcode.optional(),
    brand: productFields.brand.optional(),
    description: productFields.description.optional(),
    category: productFields.category,
    costPrice: productFields.costPrice,
    sellingPrice: productFields.sellingPrice,
    taxRate: productFields.taxRate.optional(),
    imageUrl: imageUrlSchema.optional(),
    reorderLevel: productFields.reorderLevel.optional()
});

// PUT /api/products/:id — any field may be sent, at least one is required
const updateProductSchema = z
    .object({
        ...productFields,
        status: statusSchema
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// Sort options the frontend can choose from
const SORT_OPTIONS = ["newest", "oldest", "name", "price_low", "price_high"];

// GET /api/products?search=&category=&status=&brand=&minPrice=&maxPrice=&sort=&page=&limit=
const listProductsQuerySchema = z
    .object({
        ...paginationSchema,
        search: searchSchema,
        category: objectIdSchema.optional(),
        status: statusSchema.optional(),
        brand: z.string().trim().max(100).optional(),
        minPrice: z.coerce.number({ error: "minPrice must be a number" }).min(0, "minPrice cannot be negative").optional(),
        maxPrice: z.coerce.number({ error: "maxPrice must be a number" }).min(0, "maxPrice cannot be negative").optional(),
        sort: z.enum(SORT_OPTIONS, { error: `Sort must be one of: ${SORT_OPTIONS.join(", ")}` }).default("newest")
    })
    .refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
        message: "minPrice cannot be greater than maxPrice",
        path: ["minPrice"]
    });

module.exports = { createProductSchema, updateProductSchema, listProductsQuerySchema };

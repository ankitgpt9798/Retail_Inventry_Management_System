const { z } = require("zod");
const { STOCK_TRANSACTION_TYPE, STOCK_STATUS } = require("../utils/constants");
const { objectIdSchema, paginationSchema, searchSchema, sortSchema, booleanFlagSchema } = require("./commonValidators");
const { INVENTORY_SORT, TRANSACTION_SORT, defaultSort } = require("../utils/sortOptions");

const quantitySchema = z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(1000000, "Quantity is too large");

const noteSchema = z.string().trim().max(500, "Note must be at most 500 characters");

// POST /api/inventory/stock-in
const stockInSchema = z.object({
    product: objectIdSchema,
    warehouse: objectIdSchema,
    quantity: quantitySchema,
    note: noteSchema.optional()
});

// POST /api/inventory/stock-out — a reason is required for every manual removal
const stockOutSchema = z.object({
    product: objectIdSchema,
    warehouse: objectIdSchema,
    quantity: quantitySchema,
    note: noteSchema.min(3, "Please give a reason for removing stock (e.g. damaged, expired)")
});

// PUT /api/inventory/:id/reorder-level
const reorderLevelSchema = z.object({
    reorderLevel: z
        .number({ error: "Reorder level must be a number" })
        .int("Reorder level must be a whole number")
        .min(0, "Reorder level cannot be negative")
        .max(1000000, "Reorder level is too large")
});

// GET /api/inventory?warehouse=&product=&category=&search=&lowStock=&stockStatus=&sort=&page=&limit=
const listInventoryQuerySchema = z.object({
    ...paginationSchema,
    warehouse: objectIdSchema.optional(),
    product: objectIdSchema.optional(),
    category: objectIdSchema.optional(),
    search: searchSchema,
    lowStock: booleanFlagSchema("lowStock"),
    stockStatus: z.enum(Object.values(STOCK_STATUS), { error: "Stock status is not valid" }).optional(),
    sort: sortSchema(INVENTORY_SORT, defaultSort(INVENTORY_SORT))
});

// GET /api/inventory/low-stock?warehouse=&page=&limit=
const lowStockQuerySchema = z.object({
    ...paginationSchema,
    warehouse: objectIdSchema.optional()
});

// GET /api/inventory/transactions?product=&warehouse=&type=&from=&to=&sort=&page=&limit=
// from/to are dates or date-times, e.g. 2026-09-01 or 2026-09-28T23:59:59
const transactionsQuerySchema = z
    .object({
        ...paginationSchema,
        product: objectIdSchema.optional(),
        warehouse: objectIdSchema.optional(),
        type: z.enum(Object.values(STOCK_TRANSACTION_TYPE), { error: "Transaction type is not valid" }).optional(),
        from: z.coerce.date({ error: "from must be a valid date" }).optional(),
        to: z.coerce.date({ error: "to must be a valid date" }).optional(),
        sort: sortSchema(TRANSACTION_SORT, defaultSort(TRANSACTION_SORT))
    })
    .refine((query) => !query.from || !query.to || query.from <= query.to, {
        message: "from cannot be after to",
        path: ["from"]
    });

module.exports = {
    stockInSchema,
    stockOutSchema,
    reorderLevelSchema,
    listInventoryQuerySchema,
    lowStockQuerySchema,
    transactionsQuerySchema
};

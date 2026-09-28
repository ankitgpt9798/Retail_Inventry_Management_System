const { z } = require("zod");
const { objectIdSchema, rangeFields, withValidRange } = require("./commonValidators");

// GET /api/reports/inventory?warehouse=&category=
const inventoryReportQuerySchema = z.object({
    warehouse: objectIdSchema.optional(),
    category: objectIdSchema.optional()
});

// GET /api/reports/stock-movement?from=&to=&warehouse=&product=
const stockMovementQuerySchema = withValidRange(z.object({
    ...rangeFields,
    warehouse: objectIdSchema.optional(),
    product: objectIdSchema.optional()
}));

// GET /api/reports/orders?from=&to=&warehouse=
const ordersReportQuerySchema = withValidRange(z.object({
    ...rangeFields,
    warehouse: objectIdSchema.optional()
}));

// GET /api/reports/purchases?from=&to=&supplier=
const purchasesReportQuerySchema = withValidRange(z.object({
    ...rangeFields,
    supplier: objectIdSchema.optional()
}));

// GET /api/reports/suppliers?from=&to=
const supplierReportQuerySchema = withValidRange(z.object(rangeFields));

// GET /api/reports/low-stock?warehouse=
const lowStockReportQuerySchema = z.object({
    warehouse: objectIdSchema.optional()
});

// GET /api/reports/product-performance?from=&to=&warehouse=&sortBy=&limit=
const productPerformanceQuerySchema = withValidRange(z.object({
    ...rangeFields,
    warehouse: objectIdSchema.optional(),
    sortBy: z.enum(["units", "revenue"], { error: "sortBy must be units or revenue" }).default("units"),
    limit: z.coerce
        .number({ error: "limit must be a number" })
        .int("limit must be a whole number")
        .min(1, "limit must be at least 1")
        .max(100, "limit cannot be more than 100")
        .default(10)
}));

module.exports = {
    inventoryReportQuerySchema,
    stockMovementQuerySchema,
    ordersReportQuerySchema,
    purchasesReportQuerySchema,
    supplierReportQuerySchema,
    lowStockReportQuerySchema,
    productPerformanceQuerySchema
};

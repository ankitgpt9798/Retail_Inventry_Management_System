const { z } = require("zod");
const { objectIdSchema } = require("./commonValidators");

// Report dates are plain "YYYY-MM-DD" days in the business's time zone.
// They stay as text; utils/reportDates turns them into exact start/end moments.
const isRealDate = (text) => {
    const date = new Date(`${text}T00:00:00Z`);
    // new Date("2026-02-30") rolls over to 2 March, so compare back to the text
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

const dayField = (name) =>
    z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${name} must be a date like 2026-09-30`)
        .refine(isRealDate, `${name} is not a real date`)
        .optional();

// from ≤ to (text comparison works for YYYY-MM-DD)
const withValidRange = (schema) =>
    schema.refine((query) => !query.from || !query.to || query.from <= query.to, {
        message: "from cannot be after to",
        path: ["from"]
    });

const rangeFields = {
    from: dayField("from"),
    to: dayField("to")
};

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

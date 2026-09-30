const { z } = require("zod");
const { PURCHASE_STATUS } = require("../utils/constants");
const { objectIdSchema, paginationSchema, searchSchema, sortSchema } = require("./commonValidators");
const { PURCHASE_SORT, defaultSort } = require("../utils/sortOptions");

const quantitySchema = (label) =>
    z
        .number({ error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(1, `${label} must be at least 1`)
        .max(1000000, `${label} is too large`);

// Every product may appear only once in a list of lines
const hasUniqueProducts = (lines) => new Set(lines.map((line) => line.product)).size === lines.length;

const purchaseItemSchema = z.object({
    product: objectIdSchema,
    quantityOrdered: quantitySchema("Quantity"),
    // Optional: defaults to the product's cost price
    unitCost: z
        .number({ error: "Unit cost must be a number" })
        .min(0, "Unit cost cannot be negative")
        .max(10000000, "Unit cost is too large")
        .transform((value) => Math.round(value * 100) / 100)
        .optional()
});

const itemsSchema = z
    .array(purchaseItemSchema, { error: "Items must be a list" })
    .min(1, "Purchase order must contain at least one item")
    .max(50, "Purchase order can contain at most 50 items")
    .refine(hasUniqueProducts, { message: "Each product can appear only once; change its quantity instead" });

// "2026-10-15" or a full date-time
const dateSchema = (label) => z.coerce.date({ error: `${label} must be a valid date` });

const notesSchema = z.string().trim().max(1000, "Notes must be at most 1000 characters");
const deliveryNoteSchema = z.string().trim().max(1000, "Delivery note must be at most 1000 characters");

// POST /api/purchases
const createPurchaseSchema = z.object({
    supplier: objectIdSchema,
    warehouse: objectIdSchema,
    items: itemsSchema,
    expectedDeliveryDate: dateSchema("Expected delivery date").optional(),
    notes: notesSchema.optional(),
    // true = submit for approval right away (DRAFT → PENDING)
    submit: z.boolean({ error: "submit must be true or false" }).optional()
});

// PUT /api/purchases/:id — edit a DRAFT
const updatePurchaseSchema = z
    .object({
        supplier: objectIdSchema,
        warehouse: objectIdSchema,
        items: itemsSchema,
        expectedDeliveryDate: dateSchema("Expected delivery date"),
        notes: notesSchema
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// PUT /api/purchases/:id/reject
const rejectPurchaseSchema = z.object({
    reason: z
        .string({ error: "A reason is required to reject a purchase request" })
        .trim()
        .min(3, "A reason is required to reject a purchase request")
        .max(500, "Reason must be at most 500 characters")
});

// PUT /api/purchases/:id/cancel
const cancelPurchaseSchema = z.object({
    reason: z.string().trim().max(500, "Reason must be at most 500 characters").optional()
});

// PUT /api/purchases/:id/confirm (supplier) — both fields optional
const confirmPurchaseSchema = z.object({
    expectedDeliveryDate: dateSchema("Expected delivery date").optional(),
    deliveryNote: deliveryNoteSchema.optional()
});

// PUT /api/purchases/:id/delivery (supplier) — at least one field
const deliveryUpdateSchema = confirmPurchaseSchema.refine((data) => Object.keys(data).length > 0, {
    message: "Provide an expected delivery date or a delivery note"
});

// PUT /api/purchases/:id/receive  { items: [{ product, quantity }] }
const receivePurchaseSchema = z.object({
    items: z
        .array(
            z.object({
                product: objectIdSchema,
                quantity: quantitySchema("Received quantity")
            }),
            { error: "Items must be a list" }
        )
        .min(1, "Record at least one received item")
        .max(50, "At most 50 lines per delivery")
        .refine(hasUniqueProducts, { message: "Each product can appear only once per delivery" })
});

// GET /api/purchases?status=&supplier=&warehouse=&search=&sort=&page=&limit=
const listPurchasesQuerySchema = z.object({
    ...paginationSchema,
    status: z.enum(Object.values(PURCHASE_STATUS), { error: "Status is not valid" }).optional(),
    supplier: objectIdSchema.optional(),
    warehouse: objectIdSchema.optional(),
    search: searchSchema,
    sort: sortSchema(PURCHASE_SORT, defaultSort(PURCHASE_SORT))
});

module.exports = {
    createPurchaseSchema,
    updatePurchaseSchema,
    rejectPurchaseSchema,
    cancelPurchaseSchema,
    confirmPurchaseSchema,
    deliveryUpdateSchema,
    receivePurchaseSchema,
    listPurchasesQuerySchema
};

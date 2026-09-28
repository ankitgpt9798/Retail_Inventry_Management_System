const { z } = require("zod");
const { ORDER_STATUS } = require("../utils/constants");
const { objectIdSchema, paginationSchema, searchSchema } = require("./commonValidators");

// Customers don't log in; their details are stored inside the order
const customerSchema = z.object({
    name: z
        .string({ error: "Customer name is required" })
        .trim()
        .min(2, "Customer name must be at least 2 characters")
        .max(100, "Customer name must be at most 100 characters"),
    email: z.email("Customer email is not valid").optional(),
    phone: z
        .string()
        .trim()
        .regex(/^[0-9+\-\s()]{7,20}$/, "Phone must be 7-20 characters: digits, spaces, +, - or brackets")
        .optional(),
    address: z.string().trim().max(300, "Address must be at most 300 characters").optional()
}, { error: "Customer details are required" });

// Only product and quantity: prices come from the product, never from the client
const orderItemSchema = z.object({
    product: objectIdSchema,
    quantity: z
        .number({ error: "Quantity must be a number" })
        .int("Quantity must be a whole number")
        .min(1, "Quantity must be at least 1")
        .max(10000, "Quantity is too large for one order")
});

const itemsSchema = z
    .array(orderItemSchema, { error: "Items must be a list" })
    .min(1, "Order must contain at least one item")
    .max(50, "Order can contain at most 50 items")
    .refine((items) => new Set(items.map((item) => item.product)).size === items.length, {
        message: "Each product can appear only once; change its quantity instead"
    });

const notesSchema = z.string().trim().max(1000, "Notes must be at most 1000 characters");

// POST /api/orders
const createOrderSchema = z.object({
    customer: customerSchema,
    warehouse: objectIdSchema,
    items: itemsSchema,
    notes: notesSchema.optional(),
    // true = reserve stock right away (PENDING → CONFIRMED)
    confirm: z.boolean({ error: "confirm must be true or false" }).optional()
});

// PUT /api/orders/:id — PENDING orders only
const updateOrderSchema = z
    .object({
        customer: customerSchema,
        warehouse: objectIdSchema,
        items: itemsSchema,
        notes: notesSchema
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// DELETE /api/orders/:id  { reason? }
const cancelOrderSchema = z.object({
    reason: z.string().trim().max(500, "Reason must be at most 500 characters").optional()
});

// The statuses this route can set. PENDING/CONFIRMED/CANCELLED have their own actions.
const FULFILLMENT_STATUSES = [
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.PACKED,
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.DELIVERED
];

// PUT /api/orders/:id/status  { status, note?, carrier?, trackingNumber? }
const updateOrderStatusSchema = z
    .object({
        status: z.enum(FULFILLMENT_STATUSES, {
            error: `Status must be one of: ${FULFILLMENT_STATUSES.join(", ")} (use confirm/cancel for the others)`
        }),
        note: z.string().trim().max(500, "Note must be at most 500 characters").optional(),
        carrier: z.string().trim().min(2, "Carrier must be at least 2 characters").max(100).optional(),
        trackingNumber: z.string().trim().min(3, "Tracking number must be at least 3 characters").max(100).optional()
    })
    // superRefine lets us add errors only in some cases: here, only when shipping
    .superRefine((data, context) => {
        if (data.status !== ORDER_STATUS.SHIPPED) {
            return;
        }
        if (!data.carrier) {
            context.addIssue({ code: "custom", path: ["carrier"], message: "Carrier is required when shipping an order" });
        }
        if (!data.trackingNumber) {
            context.addIssue({ code: "custom", path: ["trackingNumber"], message: "Tracking number is required when shipping an order" });
        }
    });

// GET /api/orders?status=&warehouse=&search=&from=&to=&page=&limit=
const listOrdersQuerySchema = z
    .object({
        ...paginationSchema,
        status: z.enum(Object.values(ORDER_STATUS), { error: "Status is not valid" }).optional(),
        warehouse: objectIdSchema.optional(),
        search: searchSchema,
        from: z.coerce.date({ error: "from must be a valid date" }).optional(),
        to: z.coerce.date({ error: "to must be a valid date" }).optional()
    })
    .refine((query) => !query.from || !query.to || query.from <= query.to, {
        message: "from cannot be after to",
        path: ["from"]
    });

module.exports = {
    createOrderSchema,
    updateOrderSchema,
    cancelOrderSchema,
    updateOrderStatusSchema,
    listOrdersQuerySchema
};

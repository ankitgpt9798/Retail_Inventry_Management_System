const { z } = require("zod");
const { TRANSFER_STATUS } = require("../utils/constants");
const { objectIdSchema, paginationSchema, searchSchema } = require("./commonValidators");

// POST /api/transfers
const createTransferSchema = z
    .object({
        product: objectIdSchema,
        fromWarehouse: objectIdSchema,
        toWarehouse: objectIdSchema,
        quantity: z
            .number({ error: "Quantity must be a number" })
            .int("Quantity must be a whole number")
            .min(1, "Quantity must be at least 1")
            .max(1000000, "Quantity is too large"),
        notes: z.string().trim().max(500, "Notes must be at most 500 characters").optional()
    })
    .refine((data) => data.fromWarehouse !== data.toWarehouse, {
        message: "Source and destination warehouse cannot be the same",
        path: ["toWarehouse"]
    });

// PUT /api/transfers/:id/reject — a reason is required
const rejectTransferSchema = z.object({
    reason: z
        .string({ error: "A reason is required to reject a transfer" })
        .trim()
        .min(3, "A reason is required to reject a transfer")
        .max(500, "Reason must be at most 500 characters")
});

// PUT /api/transfers/:id/cancel — reason is optional
const cancelTransferSchema = z.object({
    reason: z.string().trim().max(500, "Reason must be at most 500 characters").optional()
});

// GET /api/transfers?status=&product=&warehouse=&fromWarehouse=&toWarehouse=&search=&page=&limit=
const listTransfersQuerySchema = z.object({
    ...paginationSchema,
    status: z.enum(Object.values(TRANSFER_STATUS), { error: "Status is not valid" }).optional(),
    product: objectIdSchema.optional(),
    warehouse: objectIdSchema.optional(),
    fromWarehouse: objectIdSchema.optional(),
    toWarehouse: objectIdSchema.optional(),
    search: searchSchema
});

module.exports = { createTransferSchema, rejectTransferSchema, cancelTransferSchema, listTransfersQuerySchema };

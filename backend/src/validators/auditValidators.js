const { z } = require("zod");
const { AUDIT_ENTITY_TYPES } = require("../utils/constants");
const { objectIdSchema, paginationSchema, rangeFields, withValidRange } = require("./commonValidators");

// GET /api/audit-logs?user=&action=&entityType=&entityId=&from=&to=&sort=&page=&limit=
const listAuditLogsQuerySchema = withValidRange(z.object({
    ...paginationSchema,
    ...rangeFields,
    user: objectIdSchema.optional(),
    // Actions look like PRODUCT_UPDATED: capital letters and underscores
    action: z
        .string()
        .trim()
        .regex(/^[A-Z_]{2,60}$/, "Action must look like PRODUCT_UPDATED")
        .optional(),
    entityType: z.enum(AUDIT_ENTITY_TYPES, { error: `entityType must be one of: ${AUDIT_ENTITY_TYPES.join(", ")}` }).optional(),
    entityId: objectIdSchema.optional(),
    sort: z.enum(["newest", "oldest"], { error: "sort must be newest or oldest" }).default("newest")
}));

module.exports = { listAuditLogsQuerySchema };

const { z } = require("zod");

// A MongoDB id is 24 hexadecimal characters, e.g. "665f1c2e9b1d4a0012345678"
const objectIdSchema = z
    .string({ error: "Id is required" })
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

// ?page=2&limit=20 — query values arrive as text, z.coerce turns "2" into 2
const paginationSchema = {
    page: z.coerce
        .number({ error: "Page must be a number" })
        .int("Page must be a whole number")
        .min(1, "Page must be at least 1")
        .default(1),
    limit: z.coerce
        .number({ error: "Limit must be a number" })
        .int("Limit must be a whole number")
        .min(1, "Limit must be at least 1")
        .max(100, "Limit cannot be more than 100")
        .default(10)
};

// ?search=ravi — optional free text used for "contains" searches
const searchSchema = z.string().trim().max(100, "Search text is too long").optional();

module.exports = { objectIdSchema, paginationSchema, searchSchema };

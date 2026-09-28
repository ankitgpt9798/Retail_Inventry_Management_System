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

// ?lowStock=true / ?isRead=false — accept only the words "true"/"false".
// (z.coerce.boolean() would turn the text "false" into true, because any non-empty text is truthy)
const booleanFlagSchema = (name) =>
    z
        .enum(["true", "false"], { error: `${name} must be true or false` })
        .transform((value) => value === "true")
        .optional();

// ---------- Day ranges (reports, audit logs) ----------
// Plain "YYYY-MM-DD" days in the business's time zone. They stay as text;
// utils/reportDates turns them into exact start/end moments.
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

// ?from=2026-09-01&to=2026-09-30
const rangeFields = {
    from: dayField("from"),
    to: dayField("to")
};

// from ≤ to (text comparison works for YYYY-MM-DD)
const withValidRange = (schema) =>
    schema.refine((query) => !query.from || !query.to || query.from <= query.to, {
        message: "from cannot be after to",
        path: ["from"]
    });

module.exports = {
    objectIdSchema,
    paginationSchema,
    searchSchema,
    booleanFlagSchema,
    rangeFields,
    withValidRange
};

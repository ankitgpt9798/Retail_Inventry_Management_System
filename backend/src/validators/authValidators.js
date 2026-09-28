const { z } = require("zod");

// Password rules (bcrypt only uses the first 72 bytes, so we cap the length at 64)
const passwordSchema = z
    .string({ error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(64, "Password must be at most 64 characters")
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number");

// Public registration.
// There is deliberately NO "role" or "status" field here: z.object() removes
// unknown keys, so a user who sends { role: "ADMIN" } simply has it dropped.
const registerSchema = z.object({
    name: z
        .string({ error: "Name is required" })
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(100, "Name must be at most 100 characters"),
    email: z.email("Email is not valid"),
    password: passwordSchema,
    phone: z.string().trim().max(20, "Phone must be at most 20 characters").optional()
});

// Login only checks that both fields are present.
// Password strength rules are NOT applied here, so the error never hints at the rules.
const loginSchema = z.object({
    email: z.email("Email is not valid"),
    password: z.string({ error: "Password is required" }).min(1, "Password is required")
});

module.exports = { passwordSchema, registerSchema, loginSchema };

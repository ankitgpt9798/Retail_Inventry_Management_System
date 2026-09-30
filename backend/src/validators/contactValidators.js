const { z } = require("zod");

// POST /api/contact  { name, email, subject, message }
const contactMessageSchema = z.object({
    name: z.string({ error: "Name is required" }).trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
    email: z.email("Email is not valid"),
    subject: z.string({ error: "Subject is required" }).trim().min(3, "Subject must be at least 3 characters").max(150, "Subject is too long"),
    message: z
        .string({ error: "Message is required" })
        .trim()
        .min(10, "Message must be at least 10 characters")
        .max(2000, "Message is too long")
});

module.exports = { contactMessageSchema };

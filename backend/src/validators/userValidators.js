const { z } = require("zod");
const { ROLES, USER_STATUS } = require("../utils/constants");
const { passwordSchema } = require("./authValidators");
const { objectIdSchema, paginationSchema, searchSchema } = require("./commonValidators");

const nameSchema = z
    .string({ error: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters");

const phoneSchema = z.string().trim().max(20, "Phone must be at most 20 characters");

const roleSchema = z.enum(Object.values(ROLES), { error: "Role is not valid" });

// Admins can set ACTIVE or INACTIVE. PENDING only comes from self-registration.
const adminStatusSchema = z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE], {
    error: "Status must be ACTIVE or INACTIVE"
});

// POST /api/users (admin)
const createUserSchema = z.object({
    name: nameSchema,
    email: z.email("Email is not valid"),
    password: passwordSchema,
    phone: phoneSchema.optional(),
    role: roleSchema,
    // Required only when role is SUPPLIER (checked in userService)
    supplier: objectIdSchema.optional()
});

// PUT /api/users/:id (admin). Every field is optional, but at least one must be sent.
// No password here: passwords have their own endpoint.
const updateUserSchema = z
    .object({
        name: nameSchema.optional(),
        email: z.email("Email is not valid").optional(),
        phone: phoneSchema.optional(),
        role: roleSchema.optional(),
        status: adminStatusSchema.optional(),
        supplier: objectIdSchema.nullable().optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// PUT /api/users/:id/password (admin resets a forgotten password)
const resetPasswordSchema = z.object({
    newPassword: passwordSchema
});

// PUT /api/users/profile — users can only change these two fields about themselves
const updateProfileSchema = z
    .object({
        name: nameSchema.optional(),
        phone: phoneSchema.optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// PUT /api/users/profile/password
const changePasswordSchema = z.object({
    currentPassword: z.string({ error: "Current password is required" }).min(1, "Current password is required"),
    newPassword: passwordSchema
});

// GET /api/users?search=&role=&status=&page=&limit=
const listUsersQuerySchema = z.object({
    ...paginationSchema,
    search: searchSchema,
    role: roleSchema.optional(),
    status: z.enum(Object.values(USER_STATUS), { error: "Status is not valid" }).optional()
});

module.exports = {
    createUserSchema,
    updateUserSchema,
    resetPasswordSchema,
    updateProfileSchema,
    changePasswordSchema,
    listUsersQuerySchema
};

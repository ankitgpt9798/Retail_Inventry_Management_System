const { z } = require("zod");
const { RECORD_STATUS } = require("../utils/constants");
const { paginationSchema, searchSchema } = require("./commonValidators");

const nameSchema = z
    .string({ error: "Category name is required" })
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(100, "Category name must be at most 100 characters");

const descriptionSchema = z.string().trim().max(500, "Description must be at most 500 characters");

const statusSchema = z.enum(Object.values(RECORD_STATUS), { error: "Status must be ACTIVE or INACTIVE" });

// POST /api/categories
const createCategorySchema = z.object({
    name: nameSchema,
    description: descriptionSchema.optional()
});

// PUT /api/categories/:id — also used to reactivate (status: "ACTIVE")
const updateCategorySchema = z
    .object({
        name: nameSchema.optional(),
        description: descriptionSchema.optional(),
        status: statusSchema.optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// GET /api/categories?search=&status=&page=&limit=
const listCategoriesQuerySchema = z.object({
    ...paginationSchema,
    search: searchSchema,
    status: statusSchema.optional()
});

module.exports = { createCategorySchema, updateCategorySchema, listCategoriesQuerySchema };

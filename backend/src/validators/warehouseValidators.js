const { z } = require("zod");
const { RECORD_STATUS } = require("../utils/constants");
const { objectIdSchema, paginationSchema, searchSchema } = require("./commonValidators");

const statusSchema = z.enum(Object.values(RECORD_STATUS), { error: "Status must be ACTIVE or INACTIVE" });

const warehouseFields = {
    name: z
        .string({ error: "Warehouse name is required" })
        .trim()
        .min(2, "Warehouse name must be at least 2 characters")
        .max(100, "Warehouse name must be at most 100 characters"),
    // Short code shown in tables, e.g. "DEL-01". Saved in uppercase by the model.
    code: z
        .string({ error: "Warehouse code is required" })
        .trim()
        .min(2, "Warehouse code must be at least 2 characters")
        .max(20, "Warehouse code must be at most 20 characters")
        .regex(/^[A-Za-z0-9-]+$/, "Warehouse code can only contain letters, numbers and dashes"),
    address: z.string().trim().max(300, "Address must be at most 300 characters"),
    city: z
        .string({ error: "City is required" })
        .trim()
        .min(2, "City must be at least 2 characters")
        .max(100, "City must be at most 100 characters"),
    state: z.string().trim().max(100, "State must be at most 100 characters"),
    // Maximum number of units the warehouse can hold
    capacity: z
        .number({ error: "Capacity must be a number" })
        .int("Capacity must be a whole number")
        .min(1, "Capacity must be at least 1")
        .max(100000000, "Capacity is too large"),
    // null = remove the manager
    manager: objectIdSchema.nullable()
};

// POST /api/warehouses
const createWarehouseSchema = z.object({
    name: warehouseFields.name,
    code: warehouseFields.code,
    address: warehouseFields.address.optional(),
    city: warehouseFields.city,
    state: warehouseFields.state.optional(),
    capacity: warehouseFields.capacity,
    manager: warehouseFields.manager.optional()
});

// PUT /api/warehouses/:id — any field, at least one
const updateWarehouseSchema = z
    .object({
        ...warehouseFields,
        status: statusSchema
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// GET /api/warehouses?search=&city=&status=&manager=&page=&limit=
const listWarehousesQuerySchema = z.object({
    ...paginationSchema,
    search: searchSchema,
    city: z.string().trim().max(100).optional(),
    status: statusSchema.optional(),
    manager: objectIdSchema.optional()
});

module.exports = { createWarehouseSchema, updateWarehouseSchema, listWarehousesQuerySchema };

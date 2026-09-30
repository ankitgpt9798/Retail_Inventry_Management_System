const { z } = require("zod");
const { RECORD_STATUS } = require("../utils/constants");
const { paginationSchema, searchSchema, sortSchema } = require("./commonValidators");
const { SUPPLIER_SORT, defaultSort } = require("../utils/sortOptions");

const statusSchema = z.enum(Object.values(RECORD_STATUS), { error: "Status must be ACTIVE or INACTIVE" });

const supplierFields = {
    name: z
        .string({ error: "Supplier name is required" })
        .trim()
        .min(2, "Supplier name must be at least 2 characters")
        .max(200, "Supplier name must be at most 200 characters"),
    contactPerson: z.string().trim().max(100, "Contact person must be at most 100 characters"),
    email: z.email("Email is not valid"),
    // e.g. "+91 98765 43210", "011-2345-6789", "(022) 2345 6789"
    phone: z
        .string()
        .trim()
        .regex(/^[0-9+\-\s()]{7,20}$/, "Phone must be 7-20 characters: digits, spaces, +, - or brackets"),
    address: z.string().trim().max(300, "Address must be at most 300 characters"),
    city: z.string().trim().max(100, "City must be at most 100 characters")
};

// POST /api/suppliers
const createSupplierSchema = z.object({
    name: supplierFields.name,
    contactPerson: supplierFields.contactPerson.optional(),
    email: supplierFields.email,
    phone: supplierFields.phone.optional(),
    address: supplierFields.address.optional(),
    city: supplierFields.city.optional()
});

// PUT /api/suppliers/:id — any field, at least one (status: "ACTIVE" reactivates)
const updateSupplierSchema = z
    .object({
        ...supplierFields,
        status: statusSchema
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: "Provide at least one field to update"
    });

// GET /api/suppliers?search=&city=&status=&sort=&page=&limit=
const listSuppliersQuerySchema = z.object({
    ...paginationSchema,
    search: searchSchema,
    city: z.string().trim().max(100).optional(),
    status: statusSchema.optional(),
    sort: sortSchema(SUPPLIER_SORT, defaultSort(SUPPLIER_SORT))
});

module.exports = { createSupplierSchema, updateSupplierSchema, listSuppliersQuerySchema };

const { z } = require("zod");
const { paginationSchema, searchSchema, sortSchema } = require("./commonValidators");
const { CUSTOMER_SORT, defaultSort } = require("../utils/sortOptions");

// GET /api/customers?search=&sort=&page=&limit=
const listCustomersQuerySchema = z.object({
    ...paginationSchema,
    search: searchSchema,
    sort: sortSchema(CUSTOMER_SORT, defaultSort(CUSTOMER_SORT))
});

module.exports = { listCustomersQuerySchema };

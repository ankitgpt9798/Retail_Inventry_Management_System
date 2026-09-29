// Creates test data through the REAL API (as the admin), so UI tests can start from a known situation
// without clicking through forms first. Every record gets a unique name: tests never share or reuse data.
const { apiAs, createVia } = require("./api");
const { unique } = require("./ui");

// Runs one call as the admin and always closes the client afterwards
const asAdmin = async (fn) => {
    const admin = await apiAs("admin");
    try {
        return await fn(admin);
    }
    finally {
        await admin.dispose();
    }
};

const makeCategory = (overrides = {}) =>
    asAdmin(async (admin) => {
        const { category } = await createVia(admin, "categories", { name: `E2E Category ${unique()}`, description: "created by an E2E test", ...overrides });
        return category;
    });

// A product; makes its own category unless one is given
const makeProduct = async (overrides = {}) => {
    const category = overrides.category || (await makeCategory())._id;
    return asAdmin(async (admin) => {
        const id = unique();
        const { product } = await createVia(admin, "products", {
            name: `E2E Product ${id}`,
            sku: `E2E-${id}`.toUpperCase(),
            costPrice: 100,
            sellingPrice: 150,
            taxRate: 18,
            reorderLevel: 10,
            ...overrides,
            category
        });
        return product;
    });
};

// A warehouse, optionally with a manager (a user id)
const makeWarehouse = (overrides = {}) =>
    asAdmin(async (admin) => {
        const id = unique();
        const { warehouse } = await createVia(admin, "warehouses", {
            name: `E2E Warehouse ${id}`,
            code: `E${id}`.toUpperCase().slice(0, 12),
            city: "Delhi",
            capacity: 1000,
            ...overrides
        });
        return warehouse;
    });

// Puts stock into a warehouse through the stock-in API
const stockIn = ({ product, warehouse, quantity, note = "E2E stock" }) =>
    asAdmin(async (admin) => {
        const { inventory } = await createVia(admin, "inventory/stock-in", { product: product._id || product, warehouse: warehouse._id || warehouse, quantity, note });
        return inventory;
    });

// A GET through the API as any role; returns the parsed JSON body's `data`
const readAs = async (role, url) => {
    const client = await apiAs(role);
    try {
        const response = await client.get(url);
        const body = await response.json();
        if (!response.ok()) throw new Error(`GET ${url} as ${role} failed (${response.status()}): ${body.message}`);
        return body.data;
    }
    finally {
        await client.dispose();
    }
};

module.exports = { asAdmin, makeCategory, makeProduct, makeWarehouse, stockIn, readAs };

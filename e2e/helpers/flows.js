// Multi-step business flows through the real API, for tests that need a rich, KNOWN situation.
const { apiAs, createVia } = require("./api");
const { asAdmin, makeProduct, makeWarehouse, stockIn } = require("./data");
const { unique } = require("./ui");

// One API call as a role; throws with the server's own message if it fails
const call = async (role, method, url, data) => {
    const client = await apiAs(role);
    try {
        const response = await client[method](url, data === undefined ? {} : { data });
        const body = await response.json().catch(() => ({}));
        if (!response.ok()) throw new Error(`${method.toUpperCase()} ${url} as ${role} failed (${response.status()}): ${body.message}`);
        return body.data;
    }
    finally {
        await client.dispose();
    }
};

// A purchase order, driven to a given point. Requested by Ravi (manager), approved by Neha (manager2).
//   until: "draft" | "ordered" | "received"     lines: [[product, quantity, unitCost?]]
//   receive: [[product, quantity]] units that arrive (for "ordered": a partial delivery)
const purchase = async ({ supplier, warehouse }, lines, { until = "ordered", receive = [] } = {}) => {
    const { purchase: created } = await call("manager", "post", "purchases", {
        supplier: supplier._id,
        warehouse: warehouse._id,
        items: lines.map(([product, quantityOrdered, unitCost]) => ({ product: product._id, quantityOrdered, ...(unitCost !== undefined ? { unitCost } : {}) }))
    });
    if (until === "draft") return created;

    await call("manager", "put", `purchases/${created._id}/submit`);
    await call("manager2", "put", `purchases/${created._id}/approve`);
    await call("manager2", "put", `purchases/${created._id}/order`);
    if (receive.length > 0) {
        await call("manager2", "put", `purchases/${created._id}/receive`, { items: receive.map(([product, quantity]) => ({ product: product._id, quantity })) });
    }
    return created;
};

// A customer order by Sunita (staff), driven to a status: "pending" | "confirmed" | "cancelled" | "delivered"
const order = async ({ warehouse }, lines, until = "pending") => {
    const { order: created } = await call("staff", "post", "orders", {
        customer: { name: `Report Customer ${unique()}` },
        warehouse: warehouse._id,
        items: lines.map(([product, quantity]) => ({ product: product._id, quantity }))
    });
    if (until === "pending") return created;

    await call("staff", "put", `orders/${created._id}/confirm`);
    if (until === "cancelled") {
        await call("staff", "delete", `orders/${created._id}`, { reason: "report scene" });
    }
    if (until === "delivered") {
        await call("staff", "put", `orders/${created._id}/status`, { status: "PROCESSING" });
        await call("staff", "put", `orders/${created._id}/status`, { status: "PACKED" });
        await call("staff", "put", `orders/${created._id}/status`, { status: "SHIPPED", carrier: "Blue Dart", trackingNumber: "RPT123456" });
        await call("staff", "put", `orders/${created._id}/status`, { status: "DELIVERED" });
    }
    return created;
};

const setReorderLevel = async (product, warehouse, reorderLevel) => {
    const { inventories } = await call("admin", "get", `inventory?product=${product._id}&warehouse=${warehouse._id}`);
    await call("admin", "put", `inventory/${inventories[0]._id}/reorder-level`, { reorderLevel });
};

const stockOut = (product, warehouse, quantity, note = "report scene") =>
    call("manager", "post", "inventory/stock-out", { product: product._id, warehouse: warehouse._id, quantity, note });

// A supplier company (named to sort FIRST in the drop-downs, which show only the first 100 by name)
const supplier = async (label = "Report Supplier") =>
    asAdmin(async (admin) => {
        const id = unique();
        const { supplier: created } = await createVia(admin, "suppliers", { name: `00 ${label} ${id}`, email: `report-${id}@e2e.test`, city: "Mumbai" });
        return created;
    });

module.exports = { call, purchase, order, setReorderLevel, stockOut, supplier, makeProduct, makeWarehouse, stockIn };

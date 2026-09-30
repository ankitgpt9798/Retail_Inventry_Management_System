// The ?sort= choices of each list, and the MongoDB sort each one means.
// Validators accept only these keys (sortSchema in commonValidators); services use the values.
// The FIRST key of each table is the default, which is the order the list always had.

const SUPPLIER_SORT = {
    name: { name: 1 },
    name_desc: { name: -1 },
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 }
};

const WAREHOUSE_SORT = {
    name: { name: 1 },
    name_desc: { name: -1 },
    capacity_high: { capacity: -1, name: 1 },
    capacity_low: { capacity: 1, name: 1 },
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 }
};

const PURCHASE_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amount_high: { totalAmount: -1, createdAt: -1 },
    amount_low: { totalAmount: 1, createdAt: -1 }
};

const TRANSFER_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    quantity_high: { quantity: -1, createdAt: -1 },
    quantity_low: { quantity: 1, createdAt: -1 }
};

const ORDER_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amount_high: { totalAmount: -1, createdAt: -1 },
    amount_low: { totalAmount: 1, createdAt: -1 }
};

const INVENTORY_SORT = {
    updated: { updatedAt: -1 },
    stock_low: { quantity: 1, updatedAt: -1 },
    stock_high: { quantity: -1, updatedAt: -1 }
};

const TRANSACTION_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 }
};

// Customers are built with an aggregation, so these sort the grouped rows
const CUSTOMER_SORT = {
    recent: { lastOrderAt: -1 },
    name: { name: 1 },
    spent_high: { totalSpent: -1, name: 1 },
    orders_high: { orderCount: -1, name: 1 }
};

const defaultSort = (sortTable) => Object.keys(sortTable)[0];

module.exports = {
    SUPPLIER_SORT,
    WAREHOUSE_SORT,
    PURCHASE_SORT,
    TRANSFER_SORT,
    ORDER_SORT,
    INVENTORY_SORT,
    TRANSACTION_SORT,
    CUSTOMER_SORT,
    defaultSort
};

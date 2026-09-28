// All roles and statuses live here so models, services, validation
// and tests use exactly the same values.

const ROLES = {
    ADMIN: "ADMIN",
    INVENTORY_MANAGER: "INVENTORY_MANAGER",
    STAFF: "STAFF",
    SUPPLIER: "SUPPLIER"
};

// Users have an extra PENDING state: self-registered accounts wait for admin approval
const USER_STATUS = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE"
};

// Used by products, categories, warehouses and suppliers
const RECORD_STATUS = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE"
};

const TRANSFER_STATUS = {
    REQUESTED: "REQUESTED",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    DISPATCHED: "DISPATCHED",
    RECEIVED: "RECEIVED",
    CANCELLED: "CANCELLED"
};

// Transfers that are not finished yet (their warehouses must stay active)
const OPEN_TRANSFER_STATUSES = [
    TRANSFER_STATUS.REQUESTED,
    TRANSFER_STATUS.APPROVED,
    TRANSFER_STATUS.DISPATCHED
];

const ORDER_STATUS = {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    PROCESSING: "PROCESSING",
    PACKED: "PACKED",
    SHIPPED: "SHIPPED",
    DELIVERED: "DELIVERED",
    CANCELLED: "CANCELLED"
};

// Orders whose stock is reserved (Rule 4) and not yet shipped
const RESERVING_ORDER_STATUSES = [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.PACKED
];

// Orders that can still be cancelled (before the goods leave the warehouse)
const CANCELLABLE_ORDER_STATUSES = [ORDER_STATUS.PENDING, ...RESERVING_ORDER_STATUSES];

// Orders that still need their warehouse (it must stay active)
const OPEN_ORDER_STATUSES = CANCELLABLE_ORDER_STATUSES;

const PURCHASE_STATUS = {
    DRAFT: "DRAFT",
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    ORDERED: "ORDERED",
    PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
    RECEIVED: "RECEIVED",
    CANCELLED: "CANCELLED"
};

// Purchase orders that are not finished yet (their supplier and warehouse must stay active)
const OPEN_PURCHASE_STATUSES = [
    PURCHASE_STATUS.DRAFT,
    PURCHASE_STATUS.PENDING,
    PURCHASE_STATUS.APPROVED,
    PURCHASE_STATUS.ORDERED,
    PURCHASE_STATUS.PARTIALLY_RECEIVED
];

const STOCK_TRANSACTION_TYPE = {
    STOCK_IN: "STOCK_IN",
    STOCK_OUT: "STOCK_OUT",
    TRANSFER_IN: "TRANSFER_IN",
    TRANSFER_OUT: "TRANSFER_OUT",
    ADJUSTMENT: "ADJUSTMENT"
};

// What caused a stock transaction
const STOCK_REFERENCE_TYPE = {
    MANUAL: "MANUAL",
    ORDER: "ORDER",
    PURCHASE_ORDER: "PURCHASE_ORDER",
    TRANSFER: "TRANSFER"
};

const NOTIFICATION_TYPE = {
    LOW_STOCK: "LOW_STOCK",
    NEW_ORDER: "NEW_ORDER",
    ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
    PURCHASE_APPROVED: "PURCHASE_APPROVED",
    PURCHASE_RECEIVED: "PURCHASE_RECEIVED",
    // Other purchase events: needs approval, rejected, sent to supplier, supplier confirmed…
    PURCHASE_UPDATE: "PURCHASE_UPDATE",
    STOCK_TRANSFER: "STOCK_TRANSFER",
    SYSTEM_ALERT: "SYSTEM_ALERT"
};

module.exports = {
    ROLES,
    USER_STATUS,
    RECORD_STATUS,
    TRANSFER_STATUS,
    OPEN_TRANSFER_STATUSES,
    ORDER_STATUS,
    RESERVING_ORDER_STATUSES,
    CANCELLABLE_ORDER_STATUSES,
    OPEN_ORDER_STATUSES,
    PURCHASE_STATUS,
    OPEN_PURCHASE_STATUSES,
    STOCK_TRANSACTION_TYPE,
    STOCK_REFERENCE_TYPE,
    NOTIFICATION_TYPE
};

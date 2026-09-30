// Label + colour ("tone") of every status in the app, so each one looks the same on every page.
// Tones: neutral · primary · info · success · warning · error · violet  (see components/common/Badge.jsx)
//   <StatusBadge status={order.status} styles={ORDER_STATUS_STYLES} />

// Products, categories, warehouses, suppliers
export const RECORD_STATUS_STYLES = {
    ACTIVE: { label: "Active", tone: "success" },
    INACTIVE: { label: "Inactive", tone: "neutral" }
};

export const USER_STATUS_STYLES = {
    ACTIVE: { label: "Active", tone: "success" },
    PENDING: { label: "Pending approval", tone: "warning" },
    INACTIVE: { label: "Inactive", tone: "neutral" }
};

export const TRANSFER_STATUS_STYLES = {
    REQUESTED: { label: "Requested", tone: "info" },
    APPROVED: { label: "Approved", tone: "primary" },
    REJECTED: { label: "Rejected", tone: "error" },
    DISPATCHED: { label: "Dispatched", tone: "warning" },
    RECEIVED: { label: "Received", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" }
};

export const PAYMENT_STATUS_STYLES = {
    PENDING: { label: "Payment pending", tone: "warning" },
    PAID: { label: "Paid", tone: "success" },
    PARTIALLY_PAID: { label: "Partially paid", tone: "info" },
    FAILED: { label: "Payment failed", tone: "error" },
    REFUNDED: { label: "Refunded", tone: "violet" }
};

// Stock condition of one product in one warehouse — the same rules as the backend's ?stockStatus=
//   out of stock: nothing available · low: available below the reorder level
//   overstocked: more than 5 × the reorder level on hand · healthy: everything else
export const STOCK_STATUS_STYLES = {
    HEALTHY: { label: "Healthy", tone: "success" },
    LOW_STOCK: { label: "Low stock", tone: "warning" },
    OUT_OF_STOCK: { label: "Out of stock", tone: "error" },
    OVERSTOCKED: { label: "Overstocked", tone: "info" }
};
export const OVERSTOCK_FACTOR = 5;

export const getStockStatus = ({ quantity, availableQuantity, reorderLevel }) => {
    if (availableQuantity <= 0) return "OUT_OF_STOCK";
    if (availableQuantity < reorderLevel) return "LOW_STOCK";
    if (reorderLevel > 0 && quantity > reorderLevel * OVERSTOCK_FACTOR) return "OVERSTOCKED";
    return "HEALTHY";
};

// Stock history (movement) types
export const TRANSACTION_TYPE_STYLES = {
    STOCK_IN: { label: "Stock in", tone: "success" },
    STOCK_OUT: { label: "Stock out", tone: "error" },
    TRANSFER_IN: { label: "Transfer in", tone: "primary" },
    TRANSFER_OUT: { label: "Transfer out", tone: "warning" },
    ADJUSTMENT: { label: "Adjustment", tone: "violet" }
};

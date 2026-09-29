// Purchase-order statuses in one place. Same flow as the backend:
//   DRAFT →(submit) PENDING →(approve) APPROVED →(order) ORDERED → PARTIALLY_RECEIVED → RECEIVED
//   PENDING can also be REJECTED; any open order can be CANCELLED.
// The supplier (portal) confirms an ORDERED order and can update its delivery details.

export const PURCHASE_STATUS_STYLES = {
    DRAFT: { label: "Draft", className: "badge-neutral" },
    PENDING: { label: "Awaiting approval", className: "badge-info" },
    APPROVED: { label: "Approved", className: "badge-primary" },
    REJECTED: { label: "Rejected", className: "badge-error" },
    ORDERED: { label: "Ordered", className: "badge-secondary" },
    PARTIALLY_RECEIVED: { label: "Partly received", className: "badge-warning" },
    RECEIVED: { label: "Received", className: "badge-success" },
    CANCELLED: { label: "Cancelled", className: "badge-neutral" }
};

// Statuses in which goods can still arrive
export const RECEIVABLE_STATUSES = ["ORDERED", "PARTIALLY_RECEIVED"];

// Statuses that can still be cancelled (every open one)
export const CANCELLABLE_STATUSES = ["DRAFT", "PENDING", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

// Purchase-order statuses in one place (label + colour "tone"). Same flow as the backend:
//   DRAFT →(submit) PENDING →(approve) APPROVED →(order) ORDERED → PARTIALLY_RECEIVED → RECEIVED
//   PENDING can also be REJECTED; any open order can be CANCELLED.
// The supplier (portal) confirms an ORDERED order and can update its delivery details.

export const PURCHASE_STATUS_STYLES = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING: { label: "Awaiting approval", tone: "info" },
    APPROVED: { label: "Approved", tone: "primary" },
    REJECTED: { label: "Rejected", tone: "error" },
    ORDERED: { label: "Ordered", tone: "violet" },
    PARTIALLY_RECEIVED: { label: "Partly received", tone: "warning" },
    RECEIVED: { label: "Received", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" }
};

// Statuses in which goods can still arrive
export const RECEIVABLE_STATUSES = ["ORDERED", "PARTIALLY_RECEIVED"];

// Statuses that can still be cancelled (every open one)
export const CANCELLABLE_STATUSES = ["DRAFT", "PENDING", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

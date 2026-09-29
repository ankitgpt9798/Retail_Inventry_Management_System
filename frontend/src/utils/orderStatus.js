// Order statuses in one place: label, badge colour and the next step of the flow.
// Same flow as the backend:
//   PENDING → (confirm) CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED
//   and an order can be CANCELLED any time before it ships.

export const ORDER_STATUS_STYLES = {
    PENDING: { label: "Pending", className: "badge-info" },
    CONFIRMED: { label: "Confirmed", className: "badge-primary" },
    PROCESSING: { label: "Processing", className: "badge-secondary" },
    PACKED: { label: "Packed", className: "badge-accent" },
    SHIPPED: { label: "Shipped", className: "badge-warning" },
    DELIVERED: { label: "Delivered", className: "badge-success" },
    CANCELLED: { label: "Cancelled", className: "badge-neutral" }
};

// The button that moves an order forward, by its CURRENT status.
//   kind "confirm" → PUT /orders/:id/confirm
//   kind "status"  → PUT /orders/:id/status { status }
//   kind "ship"    → same, but the carrier and tracking number are asked for first
export const NEXT_STEP = {
    PENDING: { kind: "confirm", label: "Confirm order" },
    CONFIRMED: { kind: "status", status: "PROCESSING", label: "Start processing" },
    PROCESSING: { kind: "status", status: "PACKED", label: "Mark packed" },
    PACKED: { kind: "ship", status: "SHIPPED", label: "Ship order" },
    SHIPPED: { kind: "status", status: "DELIVERED", label: "Mark delivered" }
};

// Orders that can still be cancelled (before the goods leave the warehouse)
export const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"];

// The stages shown in the fulfillment queue, in order
export const FULFILLMENT_STAGES = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED"];

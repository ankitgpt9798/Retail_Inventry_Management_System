const mongoose = require("mongoose");
const { PURCHASE_STATUS } = require("../utils/constants");

// Items are embedded because they are always read and updated together with their PO.
const purchaseItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: [true, "Product is required"]
    },
    quantityOrdered: {
        type: Number,
        required: [true, "Quantity is required"],
        min: [1, "Quantity must be at least 1"]
    },
    // Goes up each time goods arrive; allows partial receiving
    quantityReceived: {
        type: Number,
        default: 0,
        min: 0
    },
    unitCost: {
        type: Number,
        required: [true, "Unit cost is required"],
        min: [0, "Unit cost cannot be negative"]
    }
});

// A "purchase request" is simply a PurchaseOrder in DRAFT/PENDING status.
// Flow: DRAFT → PENDING → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED
const purchaseOrderSchema = new mongoose.Schema(
    {
        // Human-readable number, e.g. "PO-000123"
        poNumber: {
            type: String,
            required: true,
            unique: true
        },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: [true, "Supplier is required"]
        },
        // Warehouse where the goods will be delivered
        warehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Warehouse",
            required: [true, "Warehouse is required"]
        },
        items: {
            type: [purchaseItemSchema],
            validate: {
                validator: (items) => items.length > 0,
                message: "Purchase order must contain at least one item"
            }
        },
        status: {
            type: String,
            enum: Object.values(PURCHASE_STATUS),
            default: PURCHASE_STATUS.DRAFT
        },
        totalAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        expectedDeliveryDate: Date,
        notes: {
            type: String,
            trim: true,
            maxlength: 1000
        },
        rejectionReason: String,
        // Filled in by the supplier (Supplier role)
        supplierConfirmedAt: Date,
        deliveryNote: {
            type: String,
            trim: true,
            maxlength: 1000
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approvedAt: Date,
        orderedAt: Date,
        receivedAt: Date
    },
    { timestamps: true }
);

purchaseOrderSchema.index({ supplier: 1, status: 1 });

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema, "purchaseOrders");

module.exports = PurchaseOrder;

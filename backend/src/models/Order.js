const mongoose = require("mongoose");
const { ORDER_STATUS, PAYMENT_STATUS } = require("../utils/constants");

// Customers don't log in, so their details are stored inside the order
// (an embedded sub-document) instead of in a separate collection.
const customerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        email: {
            type: String,
            trim: true,
            lowercase: true
        },
        phone: {
            type: String,
            trim: true
        },
        address: {
            type: String,
            trim: true
        }
    },
    { _id: false }
);

// One entry per status change → used for the order tracking timeline
const statusHistorySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: Object.values(ORDER_STATUS),
            required: true
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        changedAt: {
            type: Date,
            default: Date.now
        },
        note: String
    },
    { _id: false }
);

// The order "header". Its line items are in the separate OrderItem collection.
const orderSchema = new mongoose.Schema(
    {
        // Human-readable number, e.g. "ORD-000123"
        orderNumber: {
            type: String,
            required: true,
            unique: true
        },
        customer: {
            type: customerSchema,
            required: [true, "Customer details are required"]
        },
        // The warehouse that reserves and ships the stock for this order
        warehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Warehouse",
            required: [true, "Warehouse is required"]
        },
        status: {
            type: String,
            enum: Object.values(ORDER_STATUS),
            default: ORDER_STATUS.PENDING
        },
        statusHistory: [statusHistorySchema],
        // Payment is tracked on its own: staff update it when money arrives or is refunded
        paymentStatus: {
            type: String,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.PENDING
        },
        // Totals are calculated by the order service from the order items
        subtotal: {
            type: Number,
            default: 0,
            min: 0
        },
        taxAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        totalAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        // Fulfillment details (Module 8)
        trackingNumber: String,
        carrier: String,
        notes: {
            type: String,
            trim: true,
            maxlength: 1000
        },
        cancelReason: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: true }
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ warehouse: 1, status: 1 });
orderSchema.index({ paymentStatus: 1 });

const Order = mongoose.model("Order", orderSchema, "orders");

module.exports = Order;

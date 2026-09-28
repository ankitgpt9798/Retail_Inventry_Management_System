const mongoose = require("mongoose");

// One product line inside an order, e.g. "3 × Laptop @ 50,000".
const orderItemSchema = new mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required"]
        },
        // Copies of the product's name, SKU, price and tax at the time of ordering.
        // If the product price changes next month, old orders must not change.
        productName: {
            type: String,
            required: true
        },
        sku: {
            type: String,
            required: true
        },
        unitPrice: {
            type: Number,
            required: true,
            min: [0, "Unit price cannot be negative"]
        },
        taxRate: {
            type: Number,
            default: 0,
            min: 0
        },
        quantity: {
            type: Number,
            required: [true, "Quantity is required"],
            min: [1, "Quantity must be at least 1"]
        },
        lineSubtotal: {
            type: Number,
            required: true,
            min: 0
        },
        lineTax: {
            type: Number,
            default: 0,
            min: 0
        },
        lineTotal: {
            type: Number,
            required: true,
            min: 0
        }
    },
    { timestamps: true }
);

orderItemSchema.index({ order: 1 });
orderItemSchema.index({ product: 1 });

const OrderItem = mongoose.model("OrderItem", orderItemSchema, "orderItems");

module.exports = OrderItem;

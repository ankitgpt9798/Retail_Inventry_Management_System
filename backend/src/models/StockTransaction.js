const mongoose = require("mongoose");
const { STOCK_TRANSACTION_TYPE, STOCK_REFERENCE_TYPE } = require("../utils/constants");

// A permanent history line for every change to Inventory.quantity.
// These are only ever created, never edited or deleted.
const stockTransactionSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        warehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Warehouse",
            required: true
        },
        type: {
            type: String,
            enum: Object.values(STOCK_TRANSACTION_TYPE),
            required: true
        },
        // Always positive; "type" says whether stock went up or down
        quantity: {
            type: Number,
            required: true,
            min: [1, "Quantity must be at least 1"]
        },
        quantityBefore: {
            type: Number,
            required: true
        },
        quantityAfter: {
            type: Number,
            required: true
        },
        // What caused this change, e.g. an Order or a StockTransfer, and its id
        referenceType: {
            type: String,
            enum: Object.values(STOCK_REFERENCE_TYPE),
            default: STOCK_REFERENCE_TYPE.MANUAL
        },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId
        },
        note: {
            type: String,
            trim: true,
            maxlength: 500
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

stockTransactionSchema.index({ product: 1, warehouse: 1, createdAt: -1 });

const StockTransaction = mongoose.model("StockTransaction", stockTransactionSchema, "stockTransactions");

module.exports = StockTransaction;

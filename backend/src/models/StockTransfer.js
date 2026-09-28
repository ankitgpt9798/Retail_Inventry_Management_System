const mongoose = require("mongoose");
const { TRANSFER_STATUS } = require("../utils/constants");

// A request to move stock of one product from one warehouse to another.
// Flow: REQUESTED → APPROVED → DISPATCHED (source stock goes down)
//       → RECEIVED (destination stock goes up)
const stockTransferSchema = new mongoose.Schema(
    {
        // Human-readable number, e.g. "TRF-000123"
        transferNumber: {
            type: String,
            required: true,
            unique: true
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required"]
        },
        fromWarehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Warehouse",
            required: [true, "Source warehouse is required"]
        },
        toWarehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Warehouse",
            required: [true, "Destination warehouse is required"],
            validate: {
                validator: function (toWarehouseId) {
                    // "this" is the transfer document being validated
                    if (!this.fromWarehouse) {
                        return true;
                    }
                    return !this.fromWarehouse.equals(toWarehouseId);
                },
                message: "Source and destination warehouse cannot be the same"
            }
        },
        quantity: {
            type: Number,
            required: [true, "Quantity is required"],
            min: [1, "Quantity must be at least 1"]
        },
        status: {
            type: String,
            enum: Object.values(TRANSFER_STATUS),
            default: TRANSFER_STATUS.REQUESTED
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 500
        },
        rejectionReason: {
            type: String,
            trim: true
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approvedAt: Date,
        dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        dispatchedAt: Date,
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        receivedAt: Date
    },
    { timestamps: true }
);

stockTransferSchema.index({ status: 1 });

const StockTransfer = mongoose.model("StockTransfer", stockTransferSchema, "stockTransfers");

module.exports = StockTransfer;

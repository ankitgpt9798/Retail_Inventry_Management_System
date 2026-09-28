const mongoose = require("mongoose");

// One document = stock of ONE product in ONE warehouse.
// Example: Laptop @ Delhi = 100, Laptop @ Noida = 50 → two documents.
const inventorySchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required"]
        },
        warehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Warehouse",
            required: [true, "Warehouse is required"]
        },
        // Units physically in the warehouse
        quantity: {
            type: Number,
            default: 0,
            min: [0, "Quantity cannot be negative"]
        },
        // Units promised to confirmed orders but not shipped yet
        reservedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Reserved quantity cannot be negative"]
        },
        reorderLevel: {
            type: Number,
            default: 10,
            min: [0, "Reorder level cannot be negative"]
        }
        // "lastUpdated" from the spec = the automatic updatedAt timestamp
    },
    {
        timestamps: true,
        // Include availableQuantity when the document is sent as JSON
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Business Rule 1: available = quantity - reserved.
// A virtual is calculated on the fly, not saved, so it can never get out of sync.
inventorySchema.virtual("availableQuantity").get(function () {
    return this.quantity - this.reservedQuantity;
});

// A product can only have ONE inventory record per warehouse
inventorySchema.index({ product: 1, warehouse: 1 }, { unique: true });
inventorySchema.index({ warehouse: 1 });

const Inventory = mongoose.model("Inventory", inventorySchema, "inventories");

module.exports = Inventory;

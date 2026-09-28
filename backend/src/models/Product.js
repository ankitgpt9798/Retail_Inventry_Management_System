const mongoose = require("mongoose");
const { RECORD_STATUS } = require("../utils/constants");

// A product is the catalog entry (what it is and what it costs).
// How many units exist is NOT stored here — that is in Inventory, per warehouse.
const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Product name is required"],
            trim: true,
            maxlength: 200
        },
        sku: {
            type: String,
            required: [true, "SKU is required"],
            unique: true,
            uppercase: true,
            trim: true
        },
        // Optional, but if given it must be unique.
        // sparse: true lets many products have no barcode without breaking uniqueness.
        barcode: {
            type: String,
            trim: true,
            unique: true,
            sparse: true
        },
        brand: {
            type: String,
            trim: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: 2000
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: [true, "Category is required"]
        },
        costPrice: {
            type: Number,
            required: [true, "Cost price is required"],
            min: [0, "Cost price cannot be negative"]
        },
        sellingPrice: {
            type: Number,
            required: [true, "Selling price is required"],
            min: [0, "Selling price cannot be negative"]
        },
        // Tax as a percentage, e.g. 18 means 18%
        taxRate: {
            type: Number,
            default: 0,
            min: [0, "Tax rate cannot be negative"],
            max: [100, "Tax rate cannot be more than 100"]
        },
        imageUrl: {
            type: String,
            trim: true
        },
        // Default reorder level. Copied into each Inventory record when the
        // product is first stocked in a warehouse (each warehouse can then differ).
        reorderLevel: {
            type: Number,
            default: 10,
            min: [0, "Reorder level cannot be negative"]
        },
        status: {
            type: String,
            enum: Object.values(RECORD_STATUS),
            default: RECORD_STATUS.ACTIVE
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

productSchema.index({ category: 1 });

const Product = mongoose.model("Product", productSchema, "products");

module.exports = Product;

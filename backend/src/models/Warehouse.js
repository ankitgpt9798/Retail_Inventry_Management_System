const mongoose = require("mongoose");
const { RECORD_STATUS } = require("../utils/constants");

const warehouseSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Warehouse name is required"],
            trim: true,
            maxlength: 100
        },
        // Short unique code shown in tables and transfer screens, e.g. "DEL-01"
        code: {
            type: String,
            required: [true, "Warehouse code is required"],
            unique: true,
            uppercase: true,
            trim: true
        },
        address: {
            type: String,
            trim: true
        },
        city: {
            type: String,
            required: [true, "City is required"],
            trim: true
        },
        state: {
            type: String,
            trim: true
        },
        // Maximum number of units the warehouse can hold
        capacity: {
            type: Number,
            required: [true, "Capacity is required"],
            min: [1, "Capacity must be at least 1"]
        },
        manager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        status: {
            type: String,
            enum: Object.values(RECORD_STATUS),
            default: RECORD_STATUS.ACTIVE
        }
    },
    { timestamps: true }
);

const Warehouse = mongoose.model("Warehouse", warehouseSchema, "warehouses");

module.exports = Warehouse;

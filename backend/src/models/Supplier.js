const mongoose = require("mongoose");
const { RECORD_STATUS } = require("../utils/constants");

const supplierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Supplier name is required"],
            trim: true,
            maxlength: 200
        },
        contactPerson: {
            type: String,
            trim: true
        },
        email: {
            type: String,
            required: [true, "Supplier email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Email is not valid"]
        },
        phone: {
            type: String,
            trim: true
        },
        address: {
            type: String,
            trim: true
        },
        city: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: Object.values(RECORD_STATUS),
            default: RECORD_STATUS.ACTIVE
        }
    },
    { timestamps: true }
);

const Supplier = mongoose.model("Supplier", supplierSchema, "suppliers");

module.exports = Supplier;

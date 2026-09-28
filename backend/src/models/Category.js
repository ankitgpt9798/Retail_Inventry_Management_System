const mongoose = require("mongoose");
const { RECORD_STATUS } = require("../utils/constants");

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Category name is required"],
            unique: true,
            trim: true,
            maxlength: 100
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500
        },
        status: {
            type: String,
            enum: Object.values(RECORD_STATUS),
            default: RECORD_STATUS.ACTIVE
        }
    },
    { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema, "categories");

module.exports = Category;

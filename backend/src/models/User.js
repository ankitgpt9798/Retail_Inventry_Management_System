const mongoose = require("mongoose");
const { ROLES, RECORD_STATUS } = require("../utils/constants");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            maxlength: 100
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Email is not valid"]
        },
        // Stores the bcrypt hash, never the real password.
        // select: false means normal queries don't return it;
        // login must ask for it with .select("+password").
        password: {
            type: String,
            required: [true, "Password is required"],
            select: false
        },
        role: {
            type: String,
            enum: Object.values(ROLES),
            default: ROLES.STAFF
        },
        status: {
            type: String,
            enum: Object.values(RECORD_STATUS),
            default: RECORD_STATUS.ACTIVE
        },
        phone: {
            type: String,
            trim: true
        },
        // Only for SUPPLIER users: which supplier company they log in for
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier"
        },
        lastLoginAt: Date
    },
    {
        timestamps: true,
        toJSON: {
            // Safety net: even if a password hash was loaded, never send it in a response
            transform: (doc, ret) => {
                delete ret.password;
                return ret;
            }
        }
    }
);

const User = mongoose.model("User", userSchema, "users");

module.exports = User;

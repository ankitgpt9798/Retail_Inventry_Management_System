const mongoose = require("mongoose");

// Hands out sequential numbers for human-readable codes: TRF-000001, ORD-000001, PO-000001.
// One document per sequence, e.g. { _id: "transfer", seq: 7 }.
const counterSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            required: true
        },
        seq: {
            type: Number,
            default: 0
        }
    },
    { versionKey: false }
);

const Counter = mongoose.model("Counter", counterSchema, "counters");

module.exports = Counter;

const mongoose = require("mongoose");

// Failed-login counters, used to slow down password guessing (E2E finding L2).
// One document per KEY:
//     "email:ravi@shop.com"   failed attempts against that account (whether or not the account exists,
//                              so a lock can't be used to find out which emails are registered)
//     "ip:203.0.113.7"        failed attempts from that network address
// A document says how many failures are on record (count), whether the key is locked right now (lockedUntil),
// and when the whole record can be forgotten (expiresAt). MongoDB deletes expired records by itself.
const loginAttemptSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true
        },
        count: {
            type: Number,
            default: 0
        },
        lockedUntil: Date,
        expiresAt: {
            type: Date,
            required: true
        }
    },
    { timestamps: false }
);

// TTL index: the record is removed once expiresAt has passed (the cleanup runs about once a minute,
// so the code never relies on it: it always compares the dates itself)
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginAttempt = mongoose.model("LoginAttempt", loginAttemptSchema, "loginattempts");

module.exports = LoginAttempt;

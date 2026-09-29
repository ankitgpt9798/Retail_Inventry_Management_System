const mongoose = require("mongoose");

// Login tokens that were ended early by logging out (E2E finding L1).
// A login token is a signed, self-contained ticket: the server would accept a copy of it until it expires,
// even after the person logged out. Every token carries a unique id ("jti"); logging out writes that id here,
// and the protect middleware refuses any token whose id is on this list.
// A record only has to exist until the token would have expired anyway, so MongoDB removes it after that.
const revokedTokenSchema = new mongoose.Schema(
    {
        jti: {
            type: String,
            required: true,
            unique: true
        },
        // When the token itself expires (from its "exp" claim): after this the record is pointless
        expiresAt: {
            type: Date,
            required: true
        }
    },
    { timestamps: false }
);

// TTL index: the record disappears once expiresAt has passed (cleanup runs about once a minute; harmless, because
// an expired token is refused by its own expiry date long before)
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedToken = mongoose.model("RevokedToken", revokedTokenSchema, "revokedtokens");

module.exports = RevokedToken;

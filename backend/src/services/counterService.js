const Counter = require("../models/Counter");

// Returns the next number of a sequence as a code, e.g. getNextCode("transfer", "TRF") → "TRF-000001".
//
// Why not count existing documents and add 1? If two transfers are created at the
// same moment, both would count 6 and both would get TRF-000007. $inc on a single
// counter document is atomic, so every caller gets a different number.
const getNextCode = async (sequenceName, prefix) => {
    const counter = await Counter.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
    );

    // padStart(6, "0") turns 7 into "000007"
    return `${prefix}-${String(counter.seq).padStart(6, "0")}`;
};

module.exports = { getNextCode };

const LoginAttempt = require("../models/LoginAttempt");
const AppError = require("../utils/AppError");
const { getLoginLimits } = require("../utils/loginLimits");

// Slows down password guessing (E2E finding L2). Two counters run side by side:
//   - per ACCOUNT: too many wrong passwords on one email locks that account for a while, whoever is guessing
//   - per ADDRESS: too many wrong passwords from one network address locks that address, whichever accounts it tries
//
// How a login attempt goes:
//   1. beginAttempt   CLAIM a slot first (one atomic increment on both counters). If the account or address is
//                     locked, or this claim is over the limit, refuse with 429 BEFORE the password is even looked at.
//   2. the password is checked
//   3. failAttempt    a wrong password keeps the slot, and locks the account/address when it used the last one
//      succeedAttempt a right password gives the slot back (the account's count is cleared)
//
// Claiming BEFORE checking is what makes the limit exact: 50 guesses sent at the same instant each claim a
// numbered slot, and only the first few (up to the limit) are allowed to reach the password check.

const emailKey = (email) => `email:${String(email).trim().toLowerCase()}`;
const ipKey = (ip) => `ip:${ip || "unknown"}`;

// Adds 1 to a key's count in ONE atomic database update (an aggregation-pipeline update with upsert) and returns
// the record as it is afterwards. An old, expired record starts again at 1.
const claim = async (key, lockMs) => {
    const now = new Date();
    const freshWindowEnd = new Date(now.getTime() + lockMs);

    return LoginAttempt.collection.findOneAndUpdate(
        { key },
        [
            {
                $set: {
                    count: { $cond: [{ $gt: ["$expiresAt", now] }, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
                    lockedUntil: { $cond: [{ $gt: ["$expiresAt", now] }, "$lockedUntil", null] },
                    // The record lives as long as a lock would, or as long as the lock it holds
                    expiresAt: { $cond: [{ $gt: ["$lockedUntil", now] }, "$lockedUntil", freshWindowEnd] }
                }
            }
        ],
        { upsert: true, returnDocument: "after" }
    );
};

// Locks a key from now on (safe to call several times at once)
const lock = async (key, lockMs) => {
    const lockedUntil = new Date(Date.now() + lockMs);
    await LoginAttempt.collection.updateOne(
        { key, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: new Date() } }] },
        { $set: { lockedUntil, expiresAt: lockedUntil } }
    );
    return lockedUntil;
};

const isLocked = (record) => Boolean(record && record.lockedUntil && record.lockedUntil > new Date());

const tooManyAttempts = (until) => {
    const seconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
    const minutes = Math.ceil(seconds / 60);

    // Same message whichever of the two (account or address) is locked, so it doesn't reveal which one it was
    const error = new AppError(429, "TOO_MANY_ATTEMPTS", `Too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    error.retryAfterSeconds = seconds; // becomes the Retry-After header
    return error;
};

// Step 1. Throws 429 if this attempt is not allowed. Otherwise returns what step 3 needs.
const beginAttempt = async (email, ip) => {
    const limits = getLoginLimits();
    const account = await claim(emailKey(email), limits.accountLockMs);
    const address = await claim(ipKey(ip), limits.ipLockMs);

    // Over the limit means this claim is beyond the slots that are allowed (or the key is already locked)
    const accountBlocked = isLocked(account) || account.count > limits.accountMaxFailures;
    const addressBlocked = isLocked(address) || address.count > limits.ipMaxFailures;
    if (accountBlocked || addressBlocked) {
        const untils = [];
        if (accountBlocked) untils.push(isLocked(account) ? account.lockedUntil : await lock(emailKey(email), limits.accountLockMs));
        if (addressBlocked) untils.push(isLocked(address) ? address.lockedUntil : await lock(ipKey(ip), limits.ipLockMs));
        throw tooManyAttempts(new Date(Math.max(...untils.map((until) => until.getTime()))));
    }

    return { accountCount: account.count, addressCount: address.count, limits };
};

// Step 3, wrong password (or unknown email). The slot stays used; if it was the last one, lock now, so the very next
// attempt is refused. Returns { accountLocked } so the caller can note the moment in the audit log.
const failAttempt = async (email, ip, attempt) => {
    let accountLocked = false;
    if (attempt.accountCount >= attempt.limits.accountMaxFailures) {
        await lock(emailKey(email), attempt.limits.accountLockMs);
        accountLocked = true;
    }
    if (attempt.addressCount >= attempt.limits.ipMaxFailures) {
        await lock(ipKey(ip), attempt.limits.ipLockMs);
    }
    return { accountLocked };
};

// Step 3, right password: forget the account's failures and give the address its slot back, so the address's
// count is the number of FAILURES only (many people logging in properly behind one office address never add up).
const succeedAttempt = async (email, ip) => {
    await LoginAttempt.deleteOne({ key: emailKey(email) });
    await LoginAttempt.collection.updateOne({ key: ipKey(ip), count: { $gt: 0 } }, { $inc: { count: -1 } });
};

// An admin reset the password: lift the account's lock and forget its failures
const clearAccount = async (email) => {
    await LoginAttempt.deleteOne({ key: emailKey(email) });
};

module.exports = { beginAttempt, failAttempt, succeedAttempt, clearAccount };

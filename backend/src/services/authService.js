const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const AppError = require("../utils/AppError");
const { ROLES, USER_STATUS } = require("../utils/constants");
const { logAction } = require("./auditService");
const loginThrottle = require("./loginThrottleService");

// How many times bcrypt re-hashes. Higher = slower = harder to brute-force.
// 10 takes roughly 100ms, which is fine for a login but painful for an attacker.
const SALT_ROUNDS = 10;

const hashPassword = async (plainPassword) => {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

const getTokenExpiryDays = () => {
    return Number(process.env.JWT_EXPIRES_IN_DAYS) || 1;
};

// The token only stores the user's id and tokenVersion. Role and status are read fresh
// from the database on every request (see authMiddleware), so changes apply immediately.
const createToken = (user) => {
    return jwt.sign(
        { userId: user._id.toString(), tokenVersion: user.tokenVersion },
        process.env.JWT_SECRET,
        // jwtid: a unique id for THIS token, so logging out can end this one token (see revokeToken)
        { expiresIn: `${getTokenExpiryDays()}d`, jwtid: crypto.randomUUID() }
    );
};

// Logging out: end THIS token now, even if someone kept a copy (E2E finding L1). The token's id goes on the
// revoked list until the token would have expired anyway. Harmless for anything that isn't a valid token
// (no cookie, garbage, already expired): there is simply nothing to end. Other sessions of the same person,
// on other devices, have their own tokens and keep working.
const revokeToken = async (token) => {
    if (!token) return;

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    }
    catch (error) {
        return; // forged, damaged or expired: nothing to revoke
    }

    // Tokens created before ids existed have none: they can't be ended one by one, and expire on their own
    if (!decoded.jti) return;

    await RevokedToken.updateOne(
        { jti: decoded.jti },
        { $setOnInsert: { jti: decoded.jti, expiresAt: new Date(decoded.exp * 1000) } },
        { upsert: true }
    );
};

// Public self-registration: always STAFF + PENDING, whatever the request says.
// An admin must approve the account (and may change the role) before it can log in.
const registerUser = async ({ name, email, password, phone }) => {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new AppError(409, "EMAIL_EXISTS", "An account with this email already exists");
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
        name,
        email,
        password: hashedPassword,
        phone,
        role: ROLES.STAFF,
        status: USER_STATUS.PENDING
    });

    await logAction({
        userId: user._id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: user._id
    });

    return user;
};

// requestInfo = { ip, userAgent }, stored in the audit log
const loginUser = async ({ email, password }, requestInfo) => {
    // Claim an attempt slot BEFORE looking at anything else. Too many wrong passwords on this account, or from
    // this address, means 429 right here: the password is never checked, so a locked account can't be opened
    // even with the right password, and guesses sent all at once can't get past the limit (loginThrottleService).
    const attempt = await loginThrottle.beginAttempt(email, requestInfo.ip);

    // Password has select: false in the model, so we must ask for it here
    const user = await User.findOne({ email }).select("+password");

    // Same message for "no such email" and "wrong password", so an attacker
    // cannot use the login form to find out which emails have accounts.
    // Both use up an attempt slot in exactly the same way.
    if (!user) {
        await loginThrottle.failAttempt(email, requestInfo.ip, attempt);
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
        const { accountLocked } = await loginThrottle.failAttempt(email, requestInfo.ip, attempt);

        // A trail for the admin: who is being guessed at, from where, and when an account got locked
        await logAction({ userId: user._id, action: "LOGIN_FAILED", entityType: "User", entityId: user._id, metadata: requestInfo });
        if (accountLocked) {
            await logAction({ userId: user._id, action: "ACCOUNT_LOCKED", entityType: "User", entityId: user._id, metadata: requestInfo });
        }
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    // The right password: the earlier failures no longer count against this account
    await loginThrottle.succeedAttempt(email, requestInfo.ip);

    // Status is checked only after the password is correct,
    // so strangers can't learn whether an account is pending/disabled.
    if (user.status === USER_STATUS.PENDING) {
        throw new AppError(403, "ACCOUNT_PENDING", "Your account is waiting for admin approval");
    }
    if (user.status === USER_STATUS.INACTIVE) {
        throw new AppError(403, "ACCOUNT_INACTIVE", "Your account has been deactivated. Contact an administrator");
    }

    user.lastLoginAt = new Date();
    await user.save();

    await logAction({
        userId: user._id,
        action: "LOGIN",
        entityType: "User",
        entityId: user._id,
        metadata: requestInfo
    });

    const token = createToken(user);

    return { user, token };
};

module.exports = {
    hashPassword,
    getTokenExpiryDays,
    createToken,
    revokeToken,
    registerUser,
    loginUser
};

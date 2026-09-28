const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const { ROLES, USER_STATUS } = require("../utils/constants");
const { logAction } = require("./auditService");

// How many times bcrypt re-hashes. Higher = slower = harder to brute-force.
// 10 takes roughly 100ms, which is fine for a login but painful for an attacker.
const SALT_ROUNDS = 10;

const hashPassword = async (plainPassword) => {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

const getTokenExpiryDays = () => {
    return Number(process.env.JWT_EXPIRES_IN_DAYS) || 1;
};

// The token only stores the user's id. Role and status are read fresh from
// the database on every request (see authMiddleware), so changes apply immediately.
const createToken = (userId) => {
    return jwt.sign(
        { userId: userId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: `${getTokenExpiryDays()}d` }
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
    // Password has select: false in the model, so we must ask for it here
    const user = await User.findOne({ email }).select("+password");

    // Same message for "no such email" and "wrong password", so an attacker
    // cannot use the login form to find out which emails have accounts.
    if (!user) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

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

    const token = createToken(user._id);

    return { user, token };
};

module.exports = {
    hashPassword,
    getTokenExpiryDays,
    createToken,
    registerUser,
    loginUser
};

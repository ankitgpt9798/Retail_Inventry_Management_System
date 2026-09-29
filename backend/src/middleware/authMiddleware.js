const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
const AppError = require("../utils/AppError");
const { USER_STATUS } = require("../utils/constants");

// Put this on any route that requires a logged-in user.
// Flow: read cookie → verify JWT → load user from DB → attach to req.user → next()
const protect = async (req, res, next) => {
    // 1. cookie-parser has already turned the Cookie header into req.cookies
    const token = req.cookies?.token;
    if (!token) {
        throw new AppError(401, "NOT_AUTHENTICATED", "Please log in to continue");
    }

    // 2. jwt.verify checks the signature (not forged/edited) and the expiry date
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    }
    catch (error) {
        if (error.name === "TokenExpiredError") {
            throw new AppError(401, "TOKEN_EXPIRED", "Your session has expired. Please log in again");
        }
        throw new AppError(401, "INVALID_TOKEN", "Invalid login session. Please log in again");
    }

    // Logged out? A token that was ended by logging out is refused even though its signature and expiry are fine
    // (tokens from before ids existed have no jti and are only ended by expiry, a password change or deactivation)
    if (decoded.jti && (await RevokedToken.exists({ jti: decoded.jti }))) {
        throw new AppError(401, "SESSION_ENDED", "You have been logged out. Please log in again");
    }

    // 3. Load the user fresh from the database, so a deleted or deactivated
    //    account is blocked immediately, even though its token is still valid
    const user = await User.findById(decoded.userId);
    if (!user) {
        throw new AppError(401, "USER_NOT_FOUND", "The account for this session no longer exists");
    }

    // The password was changed after this token was created (tokenVersion was increased)
    if (decoded.tokenVersion !== user.tokenVersion) {
        throw new AppError(401, "SESSION_REVOKED", "Your password was changed. Please log in again");
    }
    if (user.status !== USER_STATUS.ACTIVE) {
        throw new AppError(403, "ACCOUNT_INACTIVE", "Your account is not active");
    }

    // 4. Controllers (and authorize) can now use req.user
    req.user = user;
    next();
};

module.exports = { protect };

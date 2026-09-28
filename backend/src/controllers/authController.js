const { registerUser, loginUser, getTokenExpiryDays } = require("../services/authService");

const TOKEN_COOKIE_NAME = "token";

// httpOnly: JavaScript in the browser cannot read the cookie (protects against XSS)
// sameSite "strict": the browser won't send it on requests started by other websites (CSRF)
// secure: only sent over HTTPS — turned on in production, off for http://localhost
const getCookieOptions = () => ({
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: getTokenExpiryDays() * 24 * 60 * 60 * 1000
});

// POST /api/auth/register
const register = async (req, res) => {
    const user = await registerUser(req.body);

    // No cookie here: the account is PENDING and cannot log in yet
    res.status(201).json({
        success: true,
        message: "Registration successful. An admin must approve your account before you can log in.",
        data: { user }
    });
};

// POST /api/auth/login
const login = async (req, res) => {
    const requestInfo = { ip: req.ip, userAgent: req.get("user-agent") };
    const { user, token } = await loginUser(req.body, requestInfo);

    res.cookie(TOKEN_COOKIE_NAME, token, getCookieOptions());

    res.status(200).json({
        success: true,
        message: "Login successful",
        data: { user }
    });
};

// POST /api/auth/logout
// Not protected: even a user with an expired token should be able to clear their cookie
const logout = (req, res) => {
    // Options must match the ones used to set the cookie, or the browser keeps it
    res.clearCookie(TOKEN_COOKIE_NAME, getCookieOptions());

    res.status(200).json({
        success: true,
        message: "Logged out successfully",
        data: {}
    });
};

// GET /api/auth/me — the frontend calls this on page load to see who is logged in
const getMe = (req, res) => {
    res.status(200).json({
        success: true,
        message: "Current user",
        data: { user: req.user }
    });
};

module.exports = { register, login, logout, getMe };

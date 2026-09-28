const { registerUser, loginUser } = require("../services/authService");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");

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

    setAuthCookie(res, token);

    res.status(200).json({
        success: true,
        message: "Login successful",
        data: { user }
    });
};

// POST /api/auth/logout
// Not protected: even a user with an expired token should be able to clear their cookie
const logout = (req, res) => {
    clearAuthCookie(res);

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

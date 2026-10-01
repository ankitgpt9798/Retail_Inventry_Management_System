const { getTokenExpiryDays } = require("../services/authService");

const TOKEN_COOKIE_NAME = "token";

// httpOnly: JavaScript in the browser cannot read the cookie (protects against XSS)
// sameSite: "strict" in development (CSRF protection); "none" in production so the
//   cookie is still sent when the frontend runs on a different site than the backend
// secure: only sent over HTTPS — turned on in production, off for http://localhost
//   (browsers require secure: true whenever sameSite is "none")
const getCookieOptions = () => ({
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: getTokenExpiryDays() * 24 * 60 * 60 * 1000
});

const setAuthCookie = (res, token) => {
    res.cookie(TOKEN_COOKIE_NAME, token, getCookieOptions());
};

// Options must match the ones used to set the cookie, or the browser keeps it
const clearAuthCookie = (res) => {
    res.clearCookie(TOKEN_COOKIE_NAME, getCookieOptions());
};

module.exports = { setAuthCookie, clearAuthCookie };

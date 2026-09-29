// How strict the login protection is. Read from the environment each time (not once at start-up),
// so tests can change it, and every value has a safe default:
//     LOGIN_MAX_FAILED_ATTEMPTS   wrong passwords on ONE account before it is locked          (default 5)
//     LOGIN_LOCK_MINUTES          how long that lock lasts                                    (default 15)
//     LOGIN_IP_MAX_FAILURES       wrong passwords from ONE network address before it is locked (default 20)
//     LOGIN_IP_WINDOW_MINUTES     how long the address stays locked                            (default 15)
const positiveNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const MINUTE = 60 * 1000;

const getLoginLimits = () => ({
    accountMaxFailures: positiveNumber("LOGIN_MAX_FAILED_ATTEMPTS", 5),
    accountLockMs: positiveNumber("LOGIN_LOCK_MINUTES", 15) * MINUTE,
    ipMaxFailures: positiveNumber("LOGIN_IP_MAX_FAILURES", 20),
    ipLockMs: positiveNumber("LOGIN_IP_WINDOW_MINUTES", 15) * MINUTE
});

module.exports = { getLoginLimits };

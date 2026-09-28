// Runs before every test file (see "setupFiles" in package.json).
// Tests don't read .env, so they get their own safe values here.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret";
process.env.JWT_EXPIRES_IN_DAYS = "1";

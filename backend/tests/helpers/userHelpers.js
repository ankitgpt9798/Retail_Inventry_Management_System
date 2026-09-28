// Helpers for API tests that need logged-in users of different roles.
const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const { hashPassword } = require("../../src/services/authService");
const { USER_STATUS } = require("../../src/utils/constants");

const TEST_PASSWORD = "Secret123";

// Saves a user straight into the test database (skips registration/approval)
const createTestUser = async ({ role, email, name = "Test User", status = USER_STATUS.ACTIVE, supplier }) => {
    return User.create({
        name,
        email,
        password: await hashPassword(TEST_PASSWORD),
        role,
        status,
        supplier
    });
};

// Returns a supertest "agent": it keeps the login cookie like a browser does
const loginAgent = async (email, password = TEST_PASSWORD) => {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/login").send({ email, password });
    if (response.status !== 200) {
        throw new Error(`Test login failed for ${email}: ${response.body.message}`);
    }
    return agent;
};

module.exports = { TEST_PASSWORD, createTestUser, loginAgent };

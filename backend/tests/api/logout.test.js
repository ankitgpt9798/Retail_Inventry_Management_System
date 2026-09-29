const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const User = require("../../src/models/User");
const RevokedToken = require("../../src/models/RevokedToken");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { TEST_PASSWORD, createTestUser } = require("../helpers/userHelpers");

// Logging out must END the login token, not just delete the browser's copy of it (E2E finding L1):
// a copied token has to stop working, while the same person's other devices keep working.

beforeAll(async () => {
    await connectTestDB();
    await User.init();
    await RevokedToken.init();
}, 20000);

beforeEach(async () => {
    await clearTestDB();
});

afterAll(async () => {
    await closeTestDB();
});

// Logs in and returns the raw token, so tests can play the part of "someone who kept a copy"
const loginForToken = async (email = "ravi@shop.com") => {
    const response = await request(app).post("/api/auth/login").send({ email, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    const cookie = response.headers["set-cookie"].find((line) => line.startsWith("token="));
    return cookie.split(";")[0].slice("token=".length);
};

const withToken = (token) => ({ Cookie: `token=${token}` });
const me = (token) => request(app).get("/api/auth/me").set(withToken(token));
const logout = (token) => request(app).post("/api/auth/logout").set(withToken(token));

describe("logout ends the token itself", () => {
    test("a copy of the token stops working after logout", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const token = await loginForToken();
        expect((await me(token)).status).toBe(200);

        const response = await logout(token);
        expect(response.status).toBe(200);

        const after = await me(token); // the very same token, presented again
        expect(after.status).toBe(401);
        expect(after.body).toMatchObject({ success: false, error: "SESSION_ENDED", message: "You have been logged out. Please log in again" });
    });

    test("it is refused on every protected route, not just /me", async () => {
        await createTestUser({ role: ROLES.ADMIN, email: "ravi@shop.com" });
        const token = await loginForToken();
        await logout(token);

        const statuses = {};
        for (const path of ["/api/users", "/api/products", "/api/notifications/unread-count", "/api/reports/dashboard"]) {
            statuses[path] = (await request(app).get(path).set(withToken(token))).status;
        }
        expect(statuses).toEqual({ "/api/users": 401, "/api/products": 401, "/api/notifications/unread-count": 401, "/api/reports/dashboard": 401 });
    });

    test("only THAT session ends: the same person's other devices keep working", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const laptop = await loginForToken();
        const phone = await loginForToken();
        expect(laptop).not.toBe(phone); // every login gets its own token

        await logout(laptop);

        expect((await me(laptop)).status).toBe(401);
        expect((await me(phone)).status).toBe(200);
    });

    test("logging in again after logging out works, with a fresh token", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const first = await loginForToken();
        await logout(first);

        const second = await loginForToken();

        expect((await me(second)).status).toBe(200);
        expect((await me(first)).status).toBe(401);
    });

    test("logging out twice is harmless", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const token = await loginForToken();

        expect((await logout(token)).status).toBe(200);
        expect((await logout(token)).status).toBe(200);
        expect(await RevokedToken.countDocuments()).toBe(1); // recorded once
    });

    test("the browser's cookie is cleared as before", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const token = await loginForToken();

        const response = await logout(token);

        expect(response.headers["set-cookie"].join(";")).toMatch(/token=;/);
        expect(response.body).toMatchObject({ success: true, message: "Logged out successfully" });
    });
});

describe("tokens carry an id, and the revoked list stays small and tidy", () => {
    test("every token has a unique id (jti)", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const one = jwt.decode(await loginForToken());
        const two = jwt.decode(await loginForToken());

        expect(one.jti).toMatch(/^[0-9a-f-]{36}$/);
        expect(one.jti).not.toBe(two.jti);
    });

    test("the revoked record lasts exactly as long as the token would have (then MongoDB removes it)", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const token = await loginForToken();
        const { jti, exp } = jwt.decode(token);

        await logout(token);

        const record = await RevokedToken.findOne({ jti });
        expect(record.expiresAt.getTime()).toBe(exp * 1000);
    });
});

describe("logout stays harmless when there is nothing to end", () => {
    test.each([
        ["no cookie at all", null],
        ["a garbage token", "not-a-real-token"],
        ["a token signed with another secret", jwt.sign({ userId: "x" }, "someone-elses-secret", { jwtid: "abc" })],
        ["an expired token", jwt.sign({ userId: "x" }, "test-only-jwt-secret", { jwtid: "abc", expiresIn: -10 })]
    ])("%s: 200, cookie cleared, nothing recorded", async (label, token) => {
        const req = request(app).post("/api/auth/logout");
        const response = await (token ? req.set(withToken(token)) : req);

        expect(response.status).toBe(200);
        expect(await RevokedToken.countDocuments()).toBe(0);
    });

    test("a token from before ids existed (no jti) still works until it expires, and logging out with it does not fail", async () => {
        const user = await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const legacy = jwt.sign({ userId: user._id.toString(), tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: "1d" });

        expect((await me(legacy)).status).toBe(200);
        expect((await logout(legacy)).status).toBe(200);
        expect(await RevokedToken.countDocuments()).toBe(0); // it has no id, so it can't be listed
    });
});

describe("the other ways a session ends still work", () => {
    test("a password change still ends EVERY session, including ones that never logged out", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const laptop = await loginForToken();
        const phone = await loginForToken();

        const change = await request(app)
            .put("/api/users/profile/password")
            .set(withToken(laptop))
            .send({ currentPassword: TEST_PASSWORD, newPassword: "Changed12345" });
        expect(change.status).toBe(200);

        expect((await me(laptop)).body.error).toBe("SESSION_REVOKED");
        expect((await me(phone)).body.error).toBe("SESSION_REVOKED");
    });

    test("a logged-out token is refused as 'ended' even if the account has since been deactivated", async () => {
        const user = await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        const token = await loginForToken();
        await logout(token);
        await User.updateOne({ _id: user._id }, { status: "INACTIVE" });

        expect((await me(token)).body.error).toBe("SESSION_ENDED");
    });
});

const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const AuditLog = require("../../src/models/AuditLog");
const LoginAttempt = require("../../src/models/LoginAttempt");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { TEST_PASSWORD, createTestUser, loginAgent } = require("../helpers/userHelpers");

// Login guessing protection (E2E finding L2): too many wrong passwords lock an ACCOUNT and, separately,
// a network ADDRESS. The limits are read from the environment, so these tests use small numbers.

const LIMIT_ENV = ["LOGIN_MAX_FAILED_ATTEMPTS", "LOGIN_LOCK_MINUTES", "LOGIN_IP_MAX_FAILURES", "LOGIN_IP_WINDOW_MINUTES"];

beforeAll(async () => {
    await connectTestDB();
    await User.init();
    await LoginAttempt.init(); // builds the unique index on "key"
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    for (const name of LIMIT_ENV) delete process.env[name]; // start every test from the defaults: 5 tries, 15 minutes, 20 per address
});

afterAll(async () => {
    for (const name of LIMIT_ENV) delete process.env[name];
    await closeTestDB();
});

const login = (email, password) => request(app).post("/api/auth/login").send({ email, password });

// n wrong passwords in a row; returns the status of each
const failTimes = async (email, times) => {
    const statuses = [];
    for (let attempt = 0; attempt < times; attempt++) {
        statuses.push((await login(email, "WrongPass123")).status);
    }
    return statuses;
};

describe("locking an account after repeated wrong passwords", () => {
    test("5 wrong passwords are answered 401, then the account is locked (429)", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });

        expect(await failTimes("ravi@shop.com", 5)).toEqual([401, 401, 401, 401, 401]);

        const sixth = await login("ravi@shop.com", "WrongPass123");
        expect(sixth.status).toBe(429);
        expect(sixth.body).toMatchObject({ success: false, error: "TOO_MANY_ATTEMPTS" });
        expect(sixth.body.message).toBe("Too many failed login attempts. Try again in 15 minutes.");
    });

    test("a locked account refuses even the CORRECT password, and says when to try again (Retry-After)", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 5);

        const correct = await login("ravi@shop.com", TEST_PASSWORD);

        expect(correct.status).toBe(429);
        expect(correct.headers["set-cookie"]).toBeUndefined(); // no login cookie was given
        const retryAfter = Number(correct.headers["retry-after"]);
        expect(retryAfter).toBeGreaterThan(14 * 60);
        expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    });

    test("the lock ends by itself: once it has passed, the right password works again", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 5);
        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(429);

        // 16 minutes later (the record is moved back in time; the database's own clean-up may lag by a minute)
        const past = new Date(Date.now() - 60 * 1000);
        await LoginAttempt.updateOne({ key: "email:ravi@shop.com" }, { $set: { lockedUntil: past, expiresAt: past } });

        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(200);
    });

    test("only that account is locked: other accounts can still log in", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await createTestUser({ role: ROLES.STAFF, email: "meena@shop.com" });
        await failTimes("ravi@shop.com", 5);

        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(429);
        expect((await login("meena@shop.com", TEST_PASSWORD)).status).toBe(200);
    });

    test("an email that does not exist behaves EXACTLY the same, so a lock can't reveal which emails are registered", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });

        const real = await failTimes("ravi@shop.com", 6);
        const unknown = await failTimes("nobody@shop.com", 6);

        expect(unknown).toEqual(real);
        expect(unknown).toEqual([401, 401, 401, 401, 401, 429]);
        const a = await login("ravi@shop.com", "x");
        const b = await login("nobody@shop.com", "x");
        expect(b.body).toEqual(a.body); // same message, same code
    });

    test("email case and spaces don't help: Ravi@Shop.com counts as the same account", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 3);
        await failTimes("RAVI@shop.com", 2);

        expect((await login("Ravi@Shop.com", TEST_PASSWORD)).status).toBe(429);
    });

    test("a successful login clears the count: 4 failures, a success, 4 more failures is not a lock", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });

        await failTimes("ravi@shop.com", 4);
        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(200);

        expect(await failTimes("ravi@shop.com", 4)).toEqual([401, 401, 401, 401]);
        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(200);
    });

    test("old failures are forgotten: a stale counter starts again at one", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 4);
        const past = new Date(Date.now() - 1000);
        await LoginAttempt.updateOne({ key: "email:ravi@shop.com" }, { $set: { expiresAt: past } });

        expect(await failTimes("ravi@shop.com", 4)).toEqual([401, 401, 401, 401]); // not 429 on the 2nd
        expect((await LoginAttempt.findOne({ key: "email:ravi@shop.com" })).count).toBe(4);
    });

    test("guesses arriving at the same instant cannot slip past the limit", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });

        const results = await Promise.all(Array.from({ length: 12 }, () => login("ravi@shop.com", "WrongPass123")));
        const wrong = results.filter((response) => response.status === 401).length;

        // Each attempt claims a numbered slot first, so of 12 simultaneous guesses only the first 5 may reach the
        // password check; the other 7 are refused without it being looked at
        expect(wrong).toBe(5);
        expect(results.filter((response) => response.status === 429)).toHaveLength(7);
        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(429);
    });

    test("a pending or deactivated account with the right password is not counted as a failure", async () => {
        await createTestUser({ role: ROLES.STAFF, email: "pending@shop.com", status: "PENDING" });

        for (let attempt = 0; attempt < 8; attempt++) {
            expect((await login("pending@shop.com", TEST_PASSWORD)).status).toBe(403); // still "waiting for approval", never 429
        }
    });

    test("the limits come from settings: 2 tries, 1 minute", async () => {
        process.env.LOGIN_MAX_FAILED_ATTEMPTS = "2";
        process.env.LOGIN_LOCK_MINUTES = "1";
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });

        expect(await failTimes("ravi@shop.com", 3)).toEqual([401, 401, 429]);
        expect((await login("ravi@shop.com", "x")).body.message).toBe("Too many failed login attempts. Try again in 1 minute.");
    });
});

describe("locking a network address", () => {
    test("too many failures from one address lock it for EVERY account, even with a correct password", async () => {
        process.env.LOGIN_IP_MAX_FAILURES = "6";
        await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        // 6 wrong guesses at DIFFERENT accounts: no single account reaches its own limit (5)
        for (let index = 0; index < 6; index++) {
            expect((await login(`victim${index}@shop.com`, "WrongPass123")).status).toBe(401);
        }

        const blocked = await login("ravi@shop.com", TEST_PASSWORD); // a real account, the right password
        expect(blocked.status).toBe(429);
        expect(blocked.body.error).toBe("TOO_MANY_ATTEMPTS");
    });

    test("many people logging in PROPERLY from one address (an office) never add up to a lock: only failures count", async () => {
        process.env.LOGIN_IP_MAX_FAILURES = "3";
        for (let person = 0; person < 8; person++) {
            await createTestUser({ role: ROLES.STAFF, email: `staff${person}@shop.com` });
        }

        for (let person = 0; person < 8; person++) {
            expect((await login(`staff${person}@shop.com`, TEST_PASSWORD)).status).toBe(200); // 8 logins, limit is 3 FAILURES
        }
        // ...and the address still has its full allowance of failures
        expect(await failTimes("typo@shop.com", 3)).toEqual([401, 401, 401]);
        expect((await login("staff0@shop.com", TEST_PASSWORD)).status).toBe(429);
    });

    test("the address lock has its own length", async () => {
        process.env.LOGIN_IP_MAX_FAILURES = "2";
        process.env.LOGIN_IP_WINDOW_MINUTES = "30";
        await failTimes("a@shop.com", 2);

        const blocked = await login("b@shop.com", "x");

        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(29 * 60);
    });

    test("a locked address does not affect the account's counter, and an admin-visible record exists for each", async () => {
        process.env.LOGIN_IP_MAX_FAILURES = "3";
        await failTimes("a@shop.com", 3);

        const keys = (await LoginAttempt.find().lean()).map((record) => record.key).sort();
        expect(keys.some((key) => key.startsWith("ip:"))).toBe(true);
        expect(keys).toContain("email:a@shop.com");
    });
});

describe("the audit trail and unlocking", () => {
    test("wrong passwords on a real account are logged (LOGIN_FAILED), and the moment it locks (ACCOUNT_LOCKED)", async () => {
        const user = await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 6);

        const failed = await AuditLog.find({ action: "LOGIN_FAILED", entityId: user._id });
        const locked = await AuditLog.find({ action: "ACCOUNT_LOCKED", entityId: user._id });
        expect(failed).toHaveLength(5); // the 6th attempt was refused before the password was checked
        expect(locked).toHaveLength(1);
        expect(failed[0].metadata).toMatchObject({ ip: expect.any(String) });
    });

    test("an admin's password reset lifts the lock at once", async () => {
        await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
        const target = await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 5);
        expect((await login("ravi@shop.com", TEST_PASSWORD)).status).toBe(429);

        const admin = await loginAgent("admin@shop.com");
        const reset = await admin.put(`/api/users/${target._id}/password`).send({ newPassword: "Fresh12345" });
        expect(reset.status).toBe(200);

        expect((await login("ravi@shop.com", "Fresh12345")).status).toBe(200);
    });

    test("locked-out attempts don't pile up audit records (only real password checks are logged)", async () => {
        const user = await createTestUser({ role: ROLES.STAFF, email: "ravi@shop.com" });
        await failTimes("ravi@shop.com", 5);
        const before = await AuditLog.countDocuments({ entityId: user._id });

        await failTimes("ravi@shop.com", 10); // all refused with 429

        expect(await AuditLog.countDocuments({ entityId: user._id })).toBe(before);
    });
});

describe("the rest of the API is unaffected", () => {
    test("logged-in requests are never limited by failed logins, and the health check still works", async () => {
        await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com" });
        const admin = await loginAgent("admin@shop.com");
        await failTimes("someone@shop.com", 30); // this address is now locked for LOGIN attempts

        expect((await admin.get("/api/users")).status).toBe(200);
        expect((await request(app).get("/api/health")).status).toBe(200);
    });
});

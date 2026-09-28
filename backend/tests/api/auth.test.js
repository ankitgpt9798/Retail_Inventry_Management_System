const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const User = require("../../src/models/User");
const AuditLog = require("../../src/models/AuditLog");
const { hashPassword } = require("../../src/services/authService");
const { ROLES, USER_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");

const PASSWORD = "Secret123";

beforeAll(async () => {
    await connectTestDB();
    await User.init();
}, 20000);

beforeEach(async () => {
    await clearTestDB();
});

afterAll(async () => {
    await closeTestDB();
});

// Puts a user straight into the database (skipping registration)
const createUser = async ({ role = ROLES.STAFF, status = USER_STATUS.ACTIVE, email = "user@shop.com" } = {}) => {
    return User.create({
        name: "Test User",
        email,
        password: await hashPassword(PASSWORD),
        role,
        status
    });
};

// request.agent() remembers cookies between requests, like a real browser
const loginAs = async (email = "user@shop.com") => {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/login").send({ email, password: PASSWORD });
    return { agent, response };
};

describe("POST /api/auth/register", () => {
    const validBody = { name: "Asha Verma", email: "asha@shop.com", password: PASSWORD };

    test("creates a PENDING STAFF user and does not log them in", async () => {
        const response = await request(app).post("/api/auth/register").send(validBody);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toMatchObject({
            name: "Asha Verma",
            email: "asha@shop.com",
            role: ROLES.STAFF,
            status: USER_STATUS.PENDING
        });
        expect(response.body.data.user.password).toBeUndefined();
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    test("stores a bcrypt hash, never the plain password", async () => {
        await request(app).post("/api/auth/register").send(validBody);

        const user = await User.findOne({ email: "asha@shop.com" }).select("+password");

        expect(user.password).not.toBe(PASSWORD);
        expect(user.password.startsWith("$2")).toBe(true);
    });

    test("ignores role and status sent by the user", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ ...validBody, role: ROLES.ADMIN, status: USER_STATUS.ACTIVE });

        expect(response.status).toBe(201);
        expect(response.body.data.user.role).toBe(ROLES.STAFF);
        expect(response.body.data.user.status).toBe(USER_STATUS.PENDING);
    });

    test("rejects a duplicate email with 409", async () => {
        await request(app).post("/api/auth/register").send(validBody);
        const response = await request(app)
            .post("/api/auth/register")
            .send({ ...validBody, email: "ASHA@shop.com" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("EMAIL_EXISTS");
    });

    test("rejects a weak password with 422", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ ...validBody, password: "password" });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("VALIDATION_ERROR");
        expect(response.body.message).toBe("Password must contain at least one number");
    });

    test("lists every missing field with 422", async () => {
        const response = await request(app).post("/api/auth/register").send({});

        expect(response.status).toBe(422);
        expect(response.body.errors.map((e) => e.field)).toEqual(["name", "email", "password"]);
    });

    test("rejects an invalid email", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ ...validBody, email: "not-an-email" });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Email is not valid");
    });

    test("rejects broken JSON with 400", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .set("Content-Type", "application/json")
            .send("{ bad json");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("INVALID_JSON");
    });
});

describe("POST /api/auth/login", () => {
    test("sets an HTTP-only cookie and returns the user without password", async () => {
        await createUser();
        const { response } = await loginAs();

        expect(response.status).toBe(200);
        expect(response.body.data.user.email).toBe("user@shop.com");
        expect(response.body.data.user.password).toBeUndefined();

        const cookie = response.headers["set-cookie"][0];
        expect(cookie).toMatch(/^token=/);
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("SameSite=Strict");
    });

    test("email is not case-sensitive", async () => {
        await createUser();
        const { response } = await loginAs("USER@Shop.com");

        expect(response.status).toBe(200);
    });

    test("wrong password → 401 with a generic message", async () => {
        await createUser();
        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@shop.com", password: "Wrong1234" });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            message: "Invalid email or password",
            error: "INVALID_CREDENTIALS"
        });
    });

    test("unknown email → the same 401 message as a wrong password", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "nobody@shop.com", password: PASSWORD });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid email or password");
    });

    test("PENDING user cannot log in", async () => {
        await createUser({ status: USER_STATUS.PENDING });
        const { response } = await loginAs();

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ACCOUNT_PENDING");
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    test("INACTIVE user cannot log in", async () => {
        await createUser({ status: USER_STATUS.INACTIVE });
        const { response } = await loginAs();

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ACCOUNT_INACTIVE");
    });

    test("writes a LOGIN audit record and updates lastLoginAt", async () => {
        const user = await createUser();
        await loginAs();

        const auditLog = await AuditLog.findOne({ action: "LOGIN" });
        const updatedUser = await User.findById(user._id);

        expect(auditLog.user.toString()).toBe(user._id.toString());
        expect(updatedUser.lastLoginAt).toBeInstanceOf(Date);
    });
});

describe("GET /api/auth/me (protected route)", () => {
    test("returns the logged-in user when the cookie is sent", async () => {
        await createUser({ role: ROLES.INVENTORY_MANAGER });
        const { agent } = await loginAs();

        const response = await agent.get("/api/auth/me");

        expect(response.status).toBe(200);
        expect(response.body.data.user.role).toBe(ROLES.INVENTORY_MANAGER);
        expect(response.body.data.user.password).toBeUndefined();
    });

    test("no cookie → 401", async () => {
        const response = await request(app).get("/api/auth/me");

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("NOT_AUTHENTICATED");
    });

    test("garbage token → 401 INVALID_TOKEN", async () => {
        const response = await request(app).get("/api/auth/me").set("Cookie", "token=abc.def.ghi");

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("INVALID_TOKEN");
    });

    test("token signed with a different secret → 401 INVALID_TOKEN", async () => {
        const user = await createUser();
        const forgedToken = jwt.sign({ userId: user._id.toString() }, "attacker-secret");

        const response = await request(app).get("/api/auth/me").set("Cookie", `token=${forgedToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("INVALID_TOKEN");
    });

    test("expired token → 401 TOKEN_EXPIRED", async () => {
        const user = await createUser();
        const oneMinuteAgo = Math.floor(Date.now() / 1000) - 60;
        const expiredToken = jwt.sign({ userId: user._id.toString(), exp: oneMinuteAgo }, process.env.JWT_SECRET);

        const response = await request(app).get("/api/auth/me").set("Cookie", `token=${expiredToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("TOKEN_EXPIRED");
    });

    test("user deactivated after login is blocked on the next request", async () => {
        const user = await createUser();
        const { agent } = await loginAs();

        await User.updateOne({ _id: user._id }, { status: USER_STATUS.INACTIVE });
        const response = await agent.get("/api/auth/me");

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ACCOUNT_INACTIVE");
    });

    test("user deleted after login → 401", async () => {
        const user = await createUser();
        const { agent } = await loginAs();

        await User.deleteOne({ _id: user._id });
        const response = await agent.get("/api/auth/me");

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("USER_NOT_FOUND");
    });
});

describe("POST /api/auth/logout", () => {
    test("clears the cookie, so /me is rejected afterwards", async () => {
        await createUser();
        const { agent } = await loginAs();

        const logoutResponse = await agent.post("/api/auth/logout");
        const meResponse = await agent.get("/api/auth/me");

        expect(logoutResponse.status).toBe(200);
        expect(logoutResponse.headers["set-cookie"][0]).toMatch(/^token=;/);
        expect(meResponse.status).toBe(401);
    });
});

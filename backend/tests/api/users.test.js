const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Supplier = require("../../src/models/Supplier");
const AuditLog = require("../../src/models/AuditLog");
const { ROLES, USER_STATUS } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { TEST_PASSWORD, createTestUser, loginAgent } = require("../helpers/userHelpers");

let admin;
let adminAgent;
let staff;
let staffAgent;

beforeAll(async () => {
    await connectTestDB();
    await User.init();
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    admin = await createTestUser({ role: ROLES.ADMIN, email: "admin@shop.com", name: "Admin" });
    staff = await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com", name: "Sunita Staff" });
    adminAgent = await loginAgent("admin@shop.com");
    staffAgent = await loginAgent("staff@shop.com");
});

afterAll(async () => {
    await closeTestDB();
});

describe("Access control", () => {
    test("not logged in → 401", async () => {
        const response = await request(app).get("/api/users");
        expect(response.status).toBe(401);
    });

    test.each([
        ["GET", "/api/users"],
        ["POST", "/api/users"],
        ["GET", "/api/users/000000000000000000000000"],
        ["PUT", "/api/users/000000000000000000000000"],
        ["DELETE", "/api/users/000000000000000000000000"]
    ])("STAFF cannot use %s %s (403)", async (method, url) => {
        const response = await staffAgent[method.toLowerCase()](url).send({});

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("FORBIDDEN");
    });

    test("INVENTORY_MANAGER cannot list users either", async () => {
        await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "manager@shop.com" });
        const managerAgent = await loginAgent("manager@shop.com");

        const response = await managerAgent.get("/api/users");
        expect(response.status).toBe(403);
    });
});

describe("GET /api/users (search, filter, pagination)", () => {
    beforeEach(async () => {
        await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "ravi@shop.com", name: "Ravi Kumar" });
        await createTestUser({ role: ROLES.STAFF, email: "priya@shop.com", name: "Priya Shah", status: USER_STATUS.PENDING });
    });

    test("returns users with pagination info and no passwords", async () => {
        const response = await adminAgent.get("/api/users");

        expect(response.status).toBe(200);
        expect(response.body.data.users).toHaveLength(4);
        expect(response.body.data.pagination).toEqual({ page: 1, limit: 10, total: 4, totalPages: 1 });
        expect(response.body.data.users[0].password).toBeUndefined();
    });

    test("page and limit split the results", async () => {
        const response = await adminAgent.get("/api/users?page=2&limit=3");

        expect(response.body.data.users).toHaveLength(1);
        expect(response.body.data.pagination).toEqual({ page: 2, limit: 3, total: 4, totalPages: 2 });
    });

    test("filters by role", async () => {
        const response = await adminAgent.get("/api/users?role=INVENTORY_MANAGER");

        expect(response.body.data.users.map((u) => u.email)).toEqual(["ravi@shop.com"]);
    });

    test("filters by status (find users waiting for approval)", async () => {
        const response = await adminAgent.get("/api/users?status=PENDING");

        expect(response.body.data.users.map((u) => u.email)).toEqual(["priya@shop.com"]);
    });

    test("search matches part of the name or email, ignoring case", async () => {
        const byName = await adminAgent.get("/api/users?search=KUM");
        const byEmail = await adminAgent.get("/api/users?search=priya@");

        expect(byName.body.data.users.map((u) => u.name)).toEqual(["Ravi Kumar"]);
        expect(byEmail.body.data.users.map((u) => u.name)).toEqual(["Priya Shah"]);
    });

    test("regex characters in search are treated as plain text", async () => {
        const response = await adminAgent.get("/api/users?search=" + encodeURIComponent(".*("));

        expect(response.status).toBe(200);
        expect(response.body.data.users).toHaveLength(0);
    });

    test("invalid filters → 422", async () => {
        const badRole = await adminAgent.get("/api/users?role=BOSS");
        const badLimit = await adminAgent.get("/api/users?limit=500");

        expect(badRole.status).toBe(422);
        expect(badLimit.status).toBe(422);
        expect(badLimit.body.message).toBe("Limit cannot be more than 100");
    });
});

describe("GET /api/users/:id", () => {
    test("returns one user", async () => {
        const response = await adminAgent.get(`/api/users/${staff._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.user.email).toBe("staff@shop.com");
    });

    test("unknown id → 404", async () => {
        const response = await adminAgent.get("/api/users/000000000000000000000000");

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("USER_NOT_FOUND");
    });

    test("malformed id → 400", async () => {
        const response = await adminAgent.get("/api/users/not-an-id");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("INVALID_ID");
    });
});

describe("POST /api/users (admin creates a user)", () => {
    const newManager = {
        name: "Meena Manager",
        email: "meena@shop.com",
        password: "Manager123",
        role: ROLES.INVENTORY_MANAGER
    };

    test("creates an ACTIVE user who can log in immediately", async () => {
        const response = await adminAgent.post("/api/users").send(newManager);

        expect(response.status).toBe(201);
        expect(response.body.data.user).toMatchObject({ role: ROLES.INVENTORY_MANAGER, status: USER_STATUS.ACTIVE });

        const login = await request(app).post("/api/auth/login").send({ email: "meena@shop.com", password: "Manager123" });
        expect(login.status).toBe(200);
    });

    test("writes a USER_CREATED audit record by the admin", async () => {
        await adminAgent.post("/api/users").send(newManager);

        const auditLog = await AuditLog.findOne({ action: "USER_CREATED" });
        expect(auditLog.user.toString()).toBe(admin._id.toString());
        expect(auditLog.newValue.role).toBe(ROLES.INVENTORY_MANAGER);
    });

    test("duplicate email → 409", async () => {
        const response = await adminAgent.post("/api/users").send({ ...newManager, email: "STAFF@shop.com" });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe("EMAIL_EXISTS");
    });

    test("invalid role → 422", async () => {
        const response = await adminAgent.post("/api/users").send({ ...newManager, role: "OWNER" });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Role is not valid");
    });

    test("SUPPLIER without a supplier link → 422", async () => {
        const response = await adminAgent.post("/api/users").send({ ...newManager, role: ROLES.SUPPLIER });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("SUPPLIER_REQUIRED");
    });

    test("SUPPLIER linked to a supplier that doesn't exist → 404", async () => {
        const response = await adminAgent.post("/api/users").send({
            ...newManager,
            role: ROLES.SUPPLIER,
            supplier: "000000000000000000000000"
        });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("SUPPLIER_NOT_FOUND");
    });

    test("SUPPLIER linked to a real supplier → 201 with supplier name", async () => {
        const supplier = await Supplier.create({ name: "Acme Traders", email: "sales@acme.com" });

        const response = await adminAgent.post("/api/users").send({
            ...newManager,
            role: ROLES.SUPPLIER,
            supplier: supplier._id.toString()
        });

        expect(response.status).toBe(201);
        expect(response.body.data.user.supplier.toString()).toBe(supplier._id.toString());
    });
});

describe("PUT /api/users/:id (approve, assign role, edit)", () => {
    test("approving a PENDING user lets them log in", async () => {
        const pendingUser = await createTestUser({ role: ROLES.STAFF, email: "new@shop.com", status: USER_STATUS.PENDING });

        const response = await adminAgent.put(`/api/users/${pendingUser._id}`).send({ status: USER_STATUS.ACTIVE });
        const login = await request(app).post("/api/auth/login").send({ email: "new@shop.com", password: TEST_PASSWORD });

        expect(response.status).toBe(200);
        expect(response.body.data.user.status).toBe(USER_STATUS.ACTIVE);
        expect(login.status).toBe(200);
    });

    test("a role change applies to the user's very next request", async () => {
        await adminAgent.put(`/api/users/${staff._id}`).send({ role: ROLES.INVENTORY_MANAGER });

        const me = await staffAgent.get("/api/auth/me");
        expect(me.body.data.user.role).toBe(ROLES.INVENTORY_MANAGER);
    });

    test("audit log stores old and new values", async () => {
        await adminAgent.put(`/api/users/${staff._id}`).send({ role: ROLES.INVENTORY_MANAGER });

        const auditLog = await AuditLog.findOne({ action: "USER_UPDATED" });
        expect(auditLog.oldValue.role).toBe(ROLES.STAFF);
        expect(auditLog.newValue.role).toBe(ROLES.INVENTORY_MANAGER);
    });

    test("admin cannot change their own role", async () => {
        const response = await adminAgent.put(`/api/users/${admin._id}`).send({ role: ROLES.STAFF });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("CANNOT_CHANGE_OWN_ROLE");
    });

    test("admin cannot change their own status", async () => {
        const response = await adminAgent.put(`/api/users/${admin._id}`).send({ status: USER_STATUS.INACTIVE });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("CANNOT_CHANGE_OWN_STATUS");
    });

    test("admin CAN edit their own name", async () => {
        const response = await adminAgent.put(`/api/users/${admin._id}`).send({ name: "Chief Admin" });

        expect(response.status).toBe(200);
        expect(response.body.data.user.name).toBe("Chief Admin");
    });

    test("status cannot be set back to PENDING", async () => {
        const response = await adminAgent.put(`/api/users/${staff._id}`).send({ status: USER_STATUS.PENDING });

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Status must be ACTIVE or INACTIVE");
    });

    test("email already used by someone else → 409", async () => {
        const response = await adminAgent.put(`/api/users/${staff._id}`).send({ email: "admin@shop.com" });

        expect(response.status).toBe(409);
    });

    test("empty body → 422", async () => {
        const response = await adminAgent.put(`/api/users/${staff._id}`).send({});

        expect(response.status).toBe(422);
        expect(response.body.message).toBe("Provide at least one field to update");
    });

    test("SUPPLIER user cannot be linked to an INACTIVE supplier", async () => {
        const supplier = await Supplier.create({ name: "Closed Co", email: "x@closed.in", status: "INACTIVE" });

        const response = await adminAgent.post("/api/users").send({
            name: "New Supplier User", email: "new@closed.in", password: "Supplier123",
            role: ROLES.SUPPLIER, supplier: supplier._id.toString()
        });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe("SUPPLIER_INACTIVE");
    });

    test("user of an inactive supplier: name can be fixed, but the user cannot be reactivated", async () => {
        const supplier = await Supplier.create({ name: "Closed Co", email: "x@closed.in" });
        const supplierUser = await createTestUser({
            role: ROLES.SUPPLIER, email: "s@closed.in", supplier: supplier._id, status: USER_STATUS.INACTIVE
        });
        await Supplier.updateOne({ _id: supplier._id }, { status: "INACTIVE" });

        const rename = await adminAgent.put(`/api/users/${supplierUser._id}`).send({ name: "Fixed Name" });
        const reactivate = await adminAgent.put(`/api/users/${supplierUser._id}`).send({ status: USER_STATUS.ACTIVE });

        expect(rename.status).toBe(200);
        expect(reactivate.status).toBe(422);
        expect(reactivate.body.error).toBe("SUPPLIER_INACTIVE");
    });

    test("changing a SUPPLIER to STAFF removes the supplier link", async () => {
        const supplier = await Supplier.create({ name: "Acme Traders", email: "sales@acme.com" });
        const supplierUser = await createTestUser({ role: ROLES.SUPPLIER, email: "acme@shop.com", supplier: supplier._id });

        const response = await adminAgent.put(`/api/users/${supplierUser._id}`).send({ role: ROLES.STAFF });

        expect(response.status).toBe(200);
        expect(response.body.data.user.supplier).toBeNull();
    });
});

describe("DELETE /api/users/:id (deactivate)", () => {
    test("deactivates but keeps the user in the database", async () => {
        const response = await adminAgent.delete(`/api/users/${staff._id}`);
        const stillInDb = await User.findById(staff._id);

        expect(response.status).toBe(200);
        expect(stillInDb.status).toBe(USER_STATUS.INACTIVE);
    });

    test("the deactivated user's open session stops working", async () => {
        await adminAgent.delete(`/api/users/${staff._id}`);

        const me = await staffAgent.get("/api/auth/me");
        expect(me.status).toBe(403);
    });

    test("admin cannot deactivate themselves", async () => {
        const response = await adminAgent.delete(`/api/users/${admin._id}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("CANNOT_DEACTIVATE_SELF");
    });
});

describe("PUT /api/users/:id/password (admin reset)", () => {
    test("new password works, and the user's existing sessions are logged out", async () => {
        const response = await adminAgent.put(`/api/users/${staff._id}/password`).send({ newPassword: "Reset1234" });
        const oldSession = await staffAgent.get("/api/auth/me");
        const newLogin = await request(app).post("/api/auth/login").send({ email: "staff@shop.com", password: "Reset1234" });

        expect(response.status).toBe(200);
        expect(oldSession.status).toBe(401);
        expect(oldSession.body.error).toBe("SESSION_REVOKED");
        expect(newLogin.status).toBe(200);
    });

    test("weak password → 422", async () => {
        const response = await adminAgent.put(`/api/users/${staff._id}/password`).send({ newPassword: "short" });

        expect(response.status).toBe(422);
    });
});

describe("Own profile", () => {
    test("any user can update their own name and phone", async () => {
        const response = await staffAgent.put("/api/users/profile").send({ name: "Sunita S.", phone: "9876543210" });

        expect(response.status).toBe(200);
        expect(response.body.data.user).toMatchObject({ name: "Sunita S.", phone: "9876543210" });
    });

    test("role and email sent to /profile are ignored", async () => {
        const response = await staffAgent.put("/api/users/profile").send({
            name: "Sunita",
            role: ROLES.ADMIN,
            email: "hacker@shop.com"
        });

        expect(response.body.data.user.role).toBe(ROLES.STAFF);
        expect(response.body.data.user.email).toBe("staff@shop.com");
    });

    test("change password: wrong current password → 400", async () => {
        const response = await staffAgent
            .put("/api/users/profile/password")
            .send({ currentPassword: "Wrong1234", newPassword: "NewPass123" });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("INVALID_CURRENT_PASSWORD");
    });

    test("change password: same as old → 400", async () => {
        const response = await staffAgent
            .put("/api/users/profile/password")
            .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("SAME_PASSWORD");
    });

    test("change password: logs out everywhere, new password works", async () => {
        const secondDevice = await loginAgent("staff@shop.com");

        const response = await staffAgent
            .put("/api/users/profile/password")
            .send({ currentPassword: TEST_PASSWORD, newPassword: "NewPass123" });

        expect(response.status).toBe(200);
        expect(response.headers["set-cookie"][0]).toMatch(/^token=;/);
        expect((await secondDevice.get("/api/auth/me")).status).toBe(401);

        const newLogin = await request(app).post("/api/auth/login").send({ email: "staff@shop.com", password: "NewPass123" });
        expect(newLogin.status).toBe(200);
    });
});

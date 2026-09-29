const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { AUTH_DIR, ADMIN, USERS, SUPPLIER_COMPANY } = require("../../config");
const { loginApi, createVia, statePath } = require("../../helpers/api");

// Phase 0: prepare the world every other test starts from.
//   1. The admin already exists (the backend's seed:admin ran when the E2E stack started).
//   2. Through the REAL API, as that admin: create a supplier company and one user per role.
//   3. Log each one in and save the browser cookie, so tests can start "already logged in" as any role.
test("create the users and save a logged-in state for each role", async () => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const admin = await loginApi(ADMIN.email, ADMIN.password);

    // A supplier company, and a portal user that belongs to it
    const { supplier } = await createVia(admin, "suppliers", SUPPLIER_COMPANY);
    expect(supplier._id).toBeTruthy();

    for (const user of Object.values(USERS)) {
        const body = { name: user.name, email: user.email, password: user.password, role: user.role };
        if (user.role === "SUPPLIER") body.supplier = supplier._id;
        await createVia(admin, "users", body);
    }

    // Save the cookie of every role (the cookie is what the browser sends with each request)
    await admin.storageState({ path: statePath("admin") });
    for (const [role, user] of Object.entries(USERS)) {
        const client = await loginApi(user.email, user.password);
        await client.storageState({ path: statePath(role) });
        await client.dispose();
    }
    await admin.dispose();

    // The saved cookie must really be the HttpOnly login cookie
    const saved = JSON.parse(fs.readFileSync(statePath("admin"), "utf8"));
    const token = saved.cookies.find((cookie) => cookie.name === "token");
    expect(token, "the admin state should contain the login cookie").toBeTruthy();
    expect(token.httpOnly).toBe(true);
});

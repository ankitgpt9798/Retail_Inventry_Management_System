const { test, expect } = require("@playwright/test");
const { API_URL } = require("../config");
const { apiAs, createVia, loginApi, statePath } = require("../helpers/api");
const { asAdmin, readAs } = require("../helpers/data");
const { flash, goToNav, loginViaUi, makeUser, submitLoginForm, tokenCookie, unique, cardOf, pagination } = require("../helpers/ui");

// Phase 6b: user management and the profile page, as the admin, in the real app.

// A browser with NO login. (browser.newContext() alone would inherit the admin login from test.use below.)
const strangerContext = (browser) => browser.newContext({ storageState: { cookies: [], origins: [] } });

// Each record is a card on the listing pages
const rowOf = (page, text) => cardOf(page, text);

test.describe("user management (admin)", () => {
    test.use({ storageState: statePath("admin") });

    test("create a user: they can log in straight away, with exactly the role they were given", async ({ page, browser }) => {
        const id = unique();
        const person = { name: `Created Person ${id}`, email: `created-${id}@e2e.test`, password: "Created12345" };
        await page.goto("/users");

        await page.getByRole("button", { name: "New user" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Full name").fill(person.name);
        await dialog.getByLabel("Email", { exact: true }).fill(person.email);
        await dialog.getByLabel("Role").selectOption("INVENTORY_MANAGER");
        await dialog.getByLabel("Password").fill(person.password);
        await dialog.getByRole("button", { name: "Create user" }).click();
        await expect(flash(page, "User created.")).toBeVisible();

        await page.getByRole("searchbox", { name: "Search" }).fill(person.email);
        await expect(rowOf(page, person.email)).toContainText("Inventory Manager");
        await expect(rowOf(page, person.email)).toContainText("Active");

        // A stranger's browser: log in with what the admin typed
        const context = await strangerContext(browser);
        const theirs = await context.newPage();
        await loginViaUi(theirs, person);
        await expect(theirs.getByText("Inventory Manager").first()).toBeVisible();
        await expect(theirs.getByRole("navigation", { name: "App" }).locator("a", { hasText: "Transfers" })).toHaveCount(1);
        await context.close();
    });

    test("a supplier user needs a supplier company, and lands on their orders", async ({ page, browser }) => {
        const id = unique();
        const { supplier } = await asAdmin((admin) => createVia(admin, "suppliers", { name: `E2E Portal Co ${id}`, email: `portal-co-${id}@e2e.test` }));
        await page.goto("/users");
        await page.getByRole("button", { name: "New user" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Full name").fill(`Portal Person ${id}`);
        await dialog.getByLabel("Email", { exact: true }).fill(`portal-${id}@e2e.test`);
        await dialog.getByLabel("Password").fill("Portal12345");
        await dialog.getByLabel("Role").selectOption("SUPPLIER");

        // No company chosen: stopped in the form
        await dialog.getByRole("button", { name: "Create user" }).click();
        await expect(dialog.getByText("Choose the supplier company this user belongs to")).toBeVisible();

        await dialog.getByLabel("Supplier company").selectOption(supplier._id);
        await dialog.getByRole("button", { name: "Create user" }).click();
        await expect(flash(page, "User created.")).toBeVisible();

        const context = await strangerContext(browser);
        const theirs = await context.newPage();
        await submitLoginForm(theirs, { email: `portal-${id}@e2e.test`, password: "Portal12345" });
        await expect(theirs).toHaveURL(/\/purchases$/);
        await context.close();
    });

    test("a duplicate email is refused, and weak passwords never reach the server", async ({ page }) => {
        const existing = await makeUser();
        await page.goto("/users");
        await page.getByRole("button", { name: "New user" }).click();
        const dialog = page.getByRole("dialog");

        await dialog.getByLabel("Full name").fill("Copy Cat");
        await dialog.getByLabel("Email", { exact: true }).fill(existing.email);
        await dialog.getByLabel("Password").fill("short");
        await dialog.getByRole("button", { name: "Create user" }).click();
        await expect(dialog.getByText("Password must be at least 8 characters")).toBeVisible();

        await dialog.getByLabel("Password").fill("Longenough123");
        await dialog.getByRole("button", { name: "Create user" }).click();
        await expect(dialog.getByRole("alert")).toContainText("An account with this email already exists");
    });

    test("a role change takes effect on the person's very next page load, without logging in again", async ({ browser }) => {
        const user = await makeUser({ role: "STAFF" });
        const context = await strangerContext(browser);
        const theirs = await context.newPage();
        await loginViaUi(theirs, user);
        const navLinks = () => theirs.getByRole("navigation", { name: "App" }).locator("a").allTextContents();
        expect((await navLinks()).map((text) => text.trim())).not.toContain("Transfers");
        await theirs.goto("/transfers");
        await expect(theirs.getByText("You don't have access to this page")).toBeVisible();

        // Promoted to manager
        const admin = await apiAs("admin");
        expect((await admin.put(`users/${user._id}`, { data: { role: "INVENTORY_MANAGER" } })).status()).toBe(200);
        await theirs.goto("/transfers");
        await expect(theirs.getByRole("heading", { level: 1, name: "Transfers" })).toBeVisible();
        expect((await navLinks()).map((text) => text.trim())).toContain("Transfers");

        // Demoted again: the door closes at once, on screen and in the API
        expect((await admin.put(`users/${user._id}`, { data: { role: "STAFF" } })).status()).toBe(200);
        await theirs.goto("/transfers");
        await expect(theirs.getByText("You don't have access to this page")).toBeVisible();
        const own = await theirs.evaluate(async (apiUrl) => (await fetch(`${apiUrl}/transfers`, { credentials: "include" })).status, API_URL);
        expect(own).toBe(403);
        await admin.dispose();
        await context.close();
    });

    test("an admin's password reset locks out the person's old session, and only the new password works", async ({ page, browser }) => {
        const user = await makeUser();
        const context = await strangerContext(browser);
        const theirs = await context.newPage();
        await loginViaUi(theirs, user);

        await page.goto("/users");
        await page.getByRole("searchbox", { name: "Search" }).fill(user.email);
        await page.getByRole("button", { name: `Reset password for ${user.name}` }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("New password", { exact: true }).fill("Reset12345");
        await dialog.getByLabel("Confirm new password").fill("Reset12345");
        await dialog.getByRole("button", { name: "Reset password" }).click();
        await expect(flash(page, `Password reset for ${user.name}. They must log in again.`)).toBeVisible();

        // Their existing session dies on its next request
        await goToNav(theirs, "Catalog", "Products");
        await expect(theirs).toHaveURL(/\/login$/);
        await submitLoginForm(theirs, user); // the old password
        await expect(theirs.getByRole("alert")).toContainText("Invalid email or password");
        await loginViaUi(theirs, { ...user, password: "Reset12345" });
        await expect(theirs.getByText(user.name).first()).toBeVisible();
        await context.close();
    });

    test("deactivate and reactivate: the person is locked out, then let back in", async ({ page }) => {
        const user = await makeUser();
        await page.goto("/users");
        await page.getByRole("searchbox", { name: "Search" }).fill(user.email);

        await page.getByRole("button", { name: `Deactivate ${user.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(flash(page, `${user.name} was deactivated.`)).toBeVisible();
        await expect(rowOf(page, user.email)).toContainText("Inactive");
        await expect(loginApi(user.email, user.password)).rejects.toThrow(/403/);

        await page.getByRole("button", { name: `Reactivate ${user.name}` }).click();
        await expect(flash(page, `${user.name} was reactivated.`)).toBeVisible();
        const back = await loginApi(user.email, user.password);
        expect((await back.get("auth/me")).status()).toBe(200);
        await back.dispose();
    });

    test("an admin can't demote or deactivate themselves, on screen or in the API", async ({ page }) => {
        await page.goto("/users");
        await page.getByRole("searchbox", { name: "Search" }).fill("admin@e2e.test");
        await expect(rowOf(page, "admin@e2e.test")).toContainText("(you)");
        await expect(page.getByRole("button", { name: /^Deactivate E2E Admin/ })).toHaveCount(0);

        await page.getByRole("button", { name: "Edit E2E Admin" }).click();
        await expect(page.getByRole("dialog").getByText("You can't change your own role")).toBeVisible();
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

        const admin = await apiAs("admin");
        const me = (await (await admin.get("auth/me")).json()).data.user;
        const demote = await admin.put(`users/${me._id}`, { data: { role: "STAFF" } });
        expect(demote.status()).toBe(400);
        expect((await demote.json()).error).toBe("CANNOT_CHANGE_OWN_ROLE");
        const selfDelete = await admin.delete(`users/${me._id}`);
        expect(selfDelete.status()).toBe(400);
        expect((await selfDelete.json()).error).toBe("CANNOT_DEACTIVATE_SELF");
        await admin.dispose();
    });

    test("search, role and status filters and pagination work on real data", async ({ page }) => {
        const tag = `Bulk${unique()}`;
        for (let index = 1; index <= 12; index++) {
            await makeUser({ name: `${tag} Person ${String(index).padStart(2, "0")}`, role: index <= 4 ? "INVENTORY_MANAGER" : "STAFF" });
        }
        await page.goto("/users");
        await page.getByRole("searchbox", { name: "Search" }).fill(tag);
        await expect(pagination(page)).toContainText("Showing 1–10 of 12");
        await page.getByRole("button", { name: "Next page" }).click();
        await expect(pagination(page)).toContainText("Showing 11–12 of 12");

        await page.getByRole("combobox", { name: "Role" }).selectOption("INVENTORY_MANAGER");
        await expect(pagination(page)).toContainText("Showing 1–4 of 4");
        await page.getByRole("combobox", { name: "Role" }).selectOption("");
        await page.getByRole("combobox", { name: "Status" }).selectOption("INACTIVE");
        await expect(page.getByText("No users found")).toBeVisible();
    });

    test("the API never sends password hashes or token counters", async () => {
        const target = await makeUser();
        const admin = await apiAs("admin");
        const bodies = [
            await (await admin.get("users?limit=100")).text(),
            await (await admin.get(`users/${target._id}`)).text(),
            await (await admin.get("auth/me")).text()
        ];
        for (const body of bodies) {
            expect(body).not.toMatch(/"password"/);
            expect(body).not.toMatch(/tokenVersion/);
            expect(body).not.toContain("$2"); // the start of a bcrypt hash
        }
        const login = await (await (await loginApi(target.email, target.password)).get("auth/me")).text();
        expect(login).not.toMatch(/"password"|tokenVersion/);
        await admin.dispose();
    });
});

// ======================================================================================
test.describe("my profile (any user)", () => {
    test("change name and phone: saved, shown in the top bar, and written to the audit log", async ({ browser }) => {
        const user = await makeUser();
        const context = await strangerContext(browser);
        const page = await context.newPage();
        await loginViaUi(page, user);
        await page.goto("/profile");

        await page.getByLabel("Full name").fill(`Renamed ${user.name}`);
        await page.getByLabel("Phone", { exact: true }).fill("9000012345");
        await page.getByRole("button", { name: "Save changes" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
        await expect(page.getByRole("banner").getByText(`Renamed ${user.name}`)).toBeVisible();

        const stored = (await readAs("admin", `users/${user._id}`)).user;
        expect(stored).toMatchObject({ name: `Renamed ${user.name}`, phone: "9000012345" });
        const { auditLogs } = await readAs("admin", `audit-logs?entityType=User&entityId=${user._id}&action=PROFILE_UPDATED`);
        expect(auditLogs).toHaveLength(1);
        // Email and role are not editable here: the account section says so
        await expect(page.getByText("can only be changed by an administrator")).toBeVisible();
        await context.close();
    });

    test("changing the password: wrong current password and reusing the old one are refused with clear messages", async ({ browser }) => {
        const user = await makeUser();
        const context = await strangerContext(browser);
        const page = await context.newPage();
        await loginViaUi(page, user);
        await page.goto("/profile");

        await page.getByLabel("Current password").fill("NotMyPassword1");
        await page.getByLabel("New password", { exact: true }).fill("Another12345");
        await page.getByLabel("Confirm new password").fill("Another12345");
        await page.getByRole("button", { name: "Change password" }).click();
        await expect(page.getByRole("alert")).toContainText("Current password is incorrect");
        expect(await tokenCookie(page)).toBeDefined(); // a failed attempt does not log you out

        await page.getByLabel("Current password").fill(user.password);
        await page.getByLabel("New password", { exact: true }).fill(user.password);
        await page.getByLabel("Confirm new password").fill(user.password);
        await page.getByRole("button", { name: "Change password" }).click();
        await expect(page.getByRole("alert")).toContainText("New password must be different from the current password");

        // A weak new password never leaves the form
        await page.getByLabel("New password", { exact: true }).fill("onlyletters");
        await page.getByLabel("Confirm new password").fill("onlyletters");
        await page.getByRole("button", { name: "Change password" }).click();
        await expect(page.getByText("Password must contain at least one number")).toBeVisible();
        await context.close();
    });
});

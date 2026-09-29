const { test, expect, request } = require("@playwright/test");
const { API_URL } = require("../config");
const { anonymousApi, apiAs, loginApi, statePath } = require("../helpers/api");
const { asAdmin, makeCategory, makeProduct, readAs } = require("../helpers/data");
const { loginViaUi, makeUser, unique } = require("../helpers/ui");

// Cross-cutting security behaviour, poked at from outside like an attacker (or a careless client) would.
// Where the system already does the right thing, the test says so. Where it does NOT (yet), the test pins
// the current behaviour down and says so in its title, so it is visible and can't change unnoticed.

// A response body that leaks internals: stack traces, file paths, database error details
const leaksInternals = (text) => /node_modules|\bat .*\(.*:\d+:\d+\)|MongoServerError|CastError|mongoose|E11000/i.test(text);

test.describe("what the API does with bad input", () => {
    test("query-operator injection cannot log anyone in", async () => {
        const anonymous = await anonymousApi();
        for (const data of [
            { email: { $ne: null }, password: { $ne: null } },
            { email: "admin@e2e.test", password: { $ne: "" } },
            { email: { $gt: "" }, password: "Admin12345" }
        ]) {
            const response = await anonymous.post("auth/login", { data });
            expect(response.status(), JSON.stringify(data)).toBeGreaterThanOrEqual(400);
            expect(response.status(), JSON.stringify(data)).toBeLessThan(500);
            expect(await response.text()).not.toContain('"token"');
        }
        await anonymous.dispose();
    });

    test("broken and nonsense requests get clean answers, never stack traces", async () => {
        const admin = await apiAs("admin");
        const cases = [
            ["a malformed JSON body", () => admin.post("products", { headers: { "Content-Type": "application/json" }, data: "{not json" })],
            ["an id that isn't an id", () => admin.get("products/not-an-id")],
            ["another kind of bad id", () => admin.get("orders/%00%00")],
            ["an unknown page of the API", () => admin.get("no-such-thing")],
            ["a bad query string", () => admin.get("products?page=abc&limit=-5&sort=drop")],
        ];
        for (const [what, send] of cases) {
            const response = await send();
            const text = await response.text();
            expect(response.status(), `${what}`).toBeGreaterThanOrEqual(400);
            expect(response.status(), `${what}: must not be a server crash`).toBeLessThan(500);
            expect(leaksInternals(text), `${what} leaked: ${text.slice(0, 200)}`).toBe(false);
            expect(() => JSON.parse(text), `${what}: answer should be JSON`).not.toThrow();
        }
        await admin.dispose();
    });

    // Was FINDING F5: a request body over the size limit (100 KB) is the CALLER's mistake, so the right answer is 413,
    // but the error handler only knew about malformed JSON and answered a generic 500 "Something went wrong on the
    // server". Fixed in errorMiddleware.js (maps "entity.too.large" to 413 PAYLOAD_TOO_LARGE).
    test("a request body that is too big is answered 413, not a server error", async () => {
        const admin = await apiAs("admin");
        const response = await admin.post("categories", { data: { name: "x".repeat(300_000) } });
        const text = await response.text();
        expect(leaksInternals(text)).toBe(false);
        expect(response.status()).toBe(413);
        expect(JSON.parse(text)).toMatchObject({ success: false, error: "PAYLOAD_TOO_LARGE" });
        await admin.dispose();
    });

    test("regex characters in a search are treated as plain text: no error, no accidental match-everything", async () => {
        await makeProduct(); // make sure there is something a ".*" pattern WOULD match
        const admin = await apiAs("admin");
        const some = await readAs("admin", "products?limit=1");
        expect(some.pagination.total).toBeGreaterThan(0); // there ARE products, so ".*" would match them if it were a pattern
        for (const search of [".*", "(", "[a-", "\\", "a{1,", "^$"]) {
            const response = await admin.get(`products?search=${encodeURIComponent(search)}`);
            expect(response.status(), search).toBe(200);
            expect((await response.json()).data.pagination.total, `"${search}" must not act as a pattern`).toBe(0);
        }
        await admin.dispose();
    });

    test("a profile update cannot smuggle in a role, status or password", async () => {
        const user = await makeUser({ role: "STAFF" });
        const client = await loginApi(user.email, user.password);
        const response = await client.put("users/profile", { data: { name: "Still Staff", role: "ADMIN", status: "ACTIVE", password: "Hacked12345", tokenVersion: 99 } });
        expect(response.status()).toBeLessThan(500);

        const me = (await (await client.get("auth/me")).json()).data.user;
        expect(me.role).toBe("STAFF");
        // ...and the password is unchanged: the old one still works, the "smuggled" one does not
        await expect(loginApi(user.email, "Hacked12345")).rejects.toThrow();
        const again = await loginApi(user.email, user.password);
        expect((await again.get("auth/me")).status()).toBe(200);
        await again.dispose();
        await client.dispose();
    });

    test("nobody but an admin can create an admin, and an admin's role can't be changed by a manager", async () => {
        const manager = await apiAs("manager");
        const create = await manager.post("users", { data: { name: "Sneaky Admin", email: `sneaky-${unique()}@e2e.test`, password: "Sneaky12345", role: "ADMIN" } });
        expect(create.status()).toBe(403);
        const users = await readAs("admin", "users?role=ADMIN");
        const adminId = users.users[0]._id;
        expect((await manager.put(`users/${adminId}`, { data: { role: "STAFF" } })).status()).toBe(403);
        await manager.dispose();
    });
});

test.describe("what the browser does with hostile data", () => {
    test.use({ storageState: statePath("admin") });

    test("HTML and script in names is shown as plain text and never runs", async ({ page }) => {
        const payload = `<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>`;
        const category = await makeCategory({ name: `XSS ${unique()} ${payload}`.slice(0, 100) });
        const dialogs = [];
        page.on("dialog", (dialog) => {
            dialogs.push(dialog.message());
            dialog.dismiss();
        });

        await page.goto("/categories");
        await page.getByRole("searchbox", { name: "Search" }).fill("XSS");
        await expect(page.getByRole("row").filter({ hasText: "onerror" }).first()).toBeVisible(); // the text is there, as text
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
        expect(await page.locator("img[src='x']").count()).toBe(0); // no image was created from it
        expect(dialogs).toEqual([]);

        // ...also inside a form and in the pop-up
        await page.getByRole("button", { name: `Edit ${category.name}` }).click();
        await expect(page.getByLabel("Name")).toHaveValue(category.name);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });

    test("a product image link can't be a javascript: address", async ({ page }) => {
        const admin = await apiAs("admin");
        const category = await makeCategory();
        const response = await admin.post("products", {
            data: { name: `Bad Image ${unique()}`, sku: `BAD-${unique()}`.toUpperCase(), category: category._id, costPrice: 1, sellingPrice: 2, imageUrl: "javascript:alert(1)" }
        });
        expect(response.status()).toBe(422);
        await admin.dispose();
        void page;
    });
});

test.describe("observations: behaviour pinned down, not yet a guarantee", () => {
    // OBSERVATION L2. There is no rate limit or lockout on the login endpoint, so a password can be guessed
    // without limit. This pins the current behaviour; if a limiter is added, this test fails and should be updated.
    test("L2: repeated wrong passwords are never slowed down or locked out (no rate limiting yet)", async () => {
        const user = await makeUser();
        const anonymous = await anonymousApi();
        const statuses = [];
        for (let attempt = 0; attempt < 15; attempt++) {
            statuses.push((await anonymous.post("auth/login", { data: { email: user.email, password: `Wrong${attempt}Pass` } })).status());
        }
        expect(new Set(statuses)).toEqual(new Set([401])); // never 429 (too many requests), never a lock
        const correct = await anonymous.post("auth/login", { data: { email: user.email, password: user.password } });
        expect(correct.status()).toBe(200); // ...and the right password still works straight after
        test.info().annotations.push({ type: "finding L2", description: "no login rate limiting or lockout" });
        await anonymous.dispose();
    });

    // OBSERVATION L3. The API announces which server software it runs and sends none of the usual browser
    // protection headers (there is no helmet-style hardening yet).
    test("L3: the API's response headers (no hardening headers yet)", async () => {
        const anonymous = await request.newContext();
        const headers = (await anonymous.get(`${API_URL}/health`)).headers();
        test.info().annotations.push({ type: "finding L3", description: `x-powered-by: ${headers["x-powered-by"] || "(absent)"}; nosniff: ${headers["x-content-type-options"] || "(absent)"}` });

        expect(headers["x-powered-by"]).toBe("Express"); // information the server does not need to give away
        expect(headers["x-content-type-options"]).toBeUndefined();
        expect(headers["strict-transport-security"]).toBeUndefined(); // expected on plain http; matters once HTTPS is used
        await anonymous.dispose();
    });

    test("the health check needs no login and reveals nothing sensitive", async () => {
        const anonymous = await anonymousApi();
        const response = await anonymous.get("health");
        expect(response.status()).toBe(200);
        expect(leaksInternals(await response.text())).toBe(false);
        await anonymous.dispose();
    });
});

test.describe("the login page itself", () => {
    test("the password field hides what is typed, and nothing sensitive is put in the address bar", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
        await page.getByLabel("Email", { exact: true }).fill("staff@example.test");
        await page.getByLabel("Password", { exact: true }).fill("Secret12345");
        await page.getByRole("button", { name: "Log in" }).click();
        expect(page.url()).not.toContain("Secret12345");
        expect(page.url()).not.toContain("password");
    });

    test("after logging in, the browser's back button doesn't reveal the login form filled in", async ({ page }) => {
        const user = await makeUser();
        await loginViaUi(page, user);
        await page.goBack();
        // A logged-in user who lands on /login is sent on into the app (no form, no stale password)
        await expect(page).not.toHaveURL(/\/login$/);
        expect(await page.locator('input[type="password"]').count()).toBe(0);
    });
});

void asAdmin;

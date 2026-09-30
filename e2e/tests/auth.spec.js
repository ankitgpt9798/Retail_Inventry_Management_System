const { test, expect, request } = require("@playwright/test");
const { API_URL, FRONTEND_URL, USERS } = require("../config");
const { apiAs, loginApi, statePath } = require("../helpers/api");
const { goToNav, loginViaUi, logoutViaUi, makeUser, submitLoginForm, tokenCookie, unique, cards } = require("../helpers/ui");

// Phase 1a: authentication and the HTTP-only cookie, in a real browser against the real API.

test.describe("login and the cookie", () => {
    test("logging in sets an HttpOnly, SameSite=Strict cookie that page scripts cannot read", async ({ page }) => {
        await loginViaUi(page, USERS.staff);
        await expect(page).toHaveURL(/\/dashboard$/);

        const cookie = await tokenCookie(page);
        expect(cookie, "the browser should hold a login cookie").toBeTruthy();
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.sameSite).toBe("Strict");
        expect(cookie.path).toBe("/");
        // Plain http://localhost in development; production turns Secure on (needs HTTPS, not tested here)
        expect(cookie.secure).toBe(false);
        expect(cookie.expires).toBeGreaterThan(Date.now() / 1000);

        // JavaScript on the page can't see it...
        expect(await page.evaluate(() => document.cookie)).not.toContain("token");
        // ...and the token is not parked anywhere else scripts could read it (a JWT starts with "eyJ")
        const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
        expect(stored).not.toContain("eyJ");
        expect(await page.content()).not.toContain(cookie.value);
    });

    test("the browser sends the cookie by itself; the app never sends an Authorization header", async ({ page }) => {
        const apiRequests = [];
        page.on("request", (req) => {
            if (req.url().startsWith(API_URL)) apiRequests.push(req);
        });

        await loginViaUi(page, USERS.staff);
        await page.goto("/products");
        await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();

        const productsCall = apiRequests.find((req) => req.url().includes("/products") && req.method() === "GET");
        expect(productsCall, "the products page should call the API").toBeTruthy();
        const headers = await productsCall.allHeaders();
        expect(headers.authorization).toBeUndefined();
        expect(headers.cookie).toContain("token=");
    });

    test("a wrong password shows the server's message and sets no cookie", async ({ page }) => {
        await submitLoginForm(page, { email: USERS.staff.email, password: "WrongPass123" });

        await expect(page.getByRole("alert")).toContainText("Invalid email or password");
        await expect(page).toHaveURL(/\/login$/);
        expect(await tokenCookie(page)).toBeUndefined();
    });

    test("an unknown email gets the very same message (no hint about which emails exist)", async ({ page }) => {
        await submitLoginForm(page, { email: "nobody@e2e.test", password: "Whatever123" });

        await expect(page.getByRole("alert")).toContainText("Invalid email or password");
    });

    test("the session survives a page reload", async ({ page }) => {
        await loginViaUi(page, USERS.manager);
        await page.reload();

        await expect(page.getByRole("navigation", { name: "App" })).toBeVisible();
        await expect(page.getByText(USERS.manager.name).first()).toBeVisible();
        await expect(page).toHaveURL(/\/dashboard$/);
    });

    test("opening a protected page while logged out goes to the login page, then back to that page", async ({ page }) => {
        await page.goto("/products");
        await expect(page).toHaveURL(/\/login$/);

        await page.getByLabel("Email", { exact: true }).fill(USERS.staff.email);
        await page.getByLabel("Password", { exact: true }).fill(USERS.staff.password);
        await page.getByRole("button", { name: "Log in" }).click();

        await expect(page).toHaveURL(/\/products$/);
        await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    });

    test("each role lands on its own home page", async ({ page }) => {
        await loginViaUi(page, USERS.supplier);
        await expect(page).toHaveURL(/\/purchases$/);
        await expect(page.getByRole("heading", { level: 1, name: "My purchase orders" })).toBeVisible();

        // a supplier's top bar is just their purchase orders: no drop-down menus, no other pages
        const bar = page.getByRole("navigation", { name: "App" });
        await expect(bar.getByRole("link")).toHaveText(["Purchases"]);
    });
});

test.describe("logging out", () => {
    test("logout clears the cookie, and protected pages are closed again", async ({ page }) => {
        await loginViaUi(page, USERS.staff);
        expect(await tokenCookie(page)).toBeTruthy();

        await logoutViaUi(page);
        await expect(page).toHaveURL(/\/login$/);
        expect(await tokenCookie(page)).toBeUndefined();

        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/login$/);
    });

    // Was KNOWN LIMITATION L1: logout only removed the cookie from the browser, so a COPY of the token kept working
    // until it expired. Fixed: logout now puts the token's id on a revoked list, and the server refuses it.
    test("logout ends the token itself: a copy of it stops working, and the person is told why", async ({ page, playwright }) => {
        await loginViaUi(page, USERS.staff);
        const copiedToken = (await tokenCookie(page)).value;
        const copy = await playwright.request.newContext({ baseURL: `${API_URL}/`, extraHTTPHeaders: { cookie: `token=${copiedToken}` } });
        expect((await copy.get("auth/me")).status()).toBe(200);

        await logoutViaUi(page);
        await expect(page).toHaveURL(/\/login$/);
        expect(await tokenCookie(page)).toBeUndefined();

        const after = await copy.get("auth/me");
        expect(after.status(), "the copied token must be dead after logout").toBe(401);
        expect((await after.json()).error).toBe("SESSION_ENDED");
        for (const url of ["products", "notifications", "orders"]) {
            expect((await copy.get(url)).status(), url).toBe(401);
        }
        await copy.dispose();
    });

    test("logging out on one device leaves the same person's other devices logged in", async ({ browser }) => {
        const user = await makeUser();
        const laptop = await (await browser.newContext()).newPage();
        const phone = await (await browser.newContext()).newPage();
        await loginViaUi(laptop, user);
        await loginViaUi(phone, user);

        await logoutViaUi(laptop);
        await expect(laptop).toHaveURL(/\/login$/);

        // The phone carries on: a normal click inside the app still works, and it is still logged in after a reload
        await goToNav(phone, "Catalog", "Products");
        await expect(phone.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
        await phone.reload();
        await expect(phone.getByRole("navigation", { name: "App" })).toBeVisible();
        expect(await tokenCookie(phone)).toBeDefined();

        await laptop.context().close();
        await phone.context().close();
    });

    test("the app shows the login page if its own token was ended elsewhere, and the person can log in again", async ({ page, playwright }) => {
        const user = await makeUser();
        await loginViaUi(page, user);
        const token = (await tokenCookie(page)).value;

        // The same token is used to log out from somewhere else (e.g. a second tab's API call)
        const elsewhere = await playwright.request.newContext({ baseURL: `${API_URL}/`, extraHTTPHeaders: { cookie: `token=${token}` } });
        expect((await elsewhere.post("auth/logout")).status()).toBe(200);
        await elsewhere.dispose();

        await goToNav(page, "Catalog", "Products");
        await expect(page).toHaveURL(/\/login$/);
        await loginViaUi(page, user); // a fresh login works straight away
        await expect(page).toHaveURL(/\/(dashboard|products)$/);
    });
});

test.describe("sign-up and approval", () => {
    test("register → pending (cannot log in) → admin approves → can log in", async ({ page, browser }) => {
        const id = unique();
        const person = { name: `New Joiner ${id}`, email: `joiner-${id}@e2e.test`, password: "Joiner12345" };

        // 1. Public sign-up
        await page.goto("/register");
        await page.getByLabel("Full name").fill(person.name);
        await page.getByLabel("Work email").fill(person.email);
        await page.getByLabel("Password", { exact: true }).fill(person.password);
        await page.getByLabel("Confirm password").fill(person.password);
        await page.getByRole("button", { name: "Send request" }).click();
        await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
        expect(await tokenCookie(page), "registering must not log anyone in").toBeUndefined();

        // 2. Still pending: the login is refused with a clear reason and no cookie
        await submitLoginForm(page, person);
        await expect(page.getByRole("alert")).toContainText("waiting for admin approval");
        expect(await tokenCookie(page)).toBeUndefined();

        // 3. The admin sees the request in Users and approves it (a separate browser, logged in as admin)
        const adminContext = await browser.newContext({ storageState: statePath("admin") });
        const adminPage = await adminContext.newPage();
        await adminPage.goto("/users");
        await adminPage.getByRole("searchbox", { name: "Search" }).fill(person.email);
        const row = cards(adminPage).filter({ hasText: person.email });
        await expect(row).toContainText("Pending approval");
        await row.getByRole("button", { name: `Approve ${person.name}` }).click();
        await expect(adminPage.getByRole("status")).toContainText("was approved and can now sign in");
        await expect(row).toContainText("Active");
        await adminContext.close();

        // 4. Now the very same login works, as STAFF (sign-ups can never choose their own role)
        await loginViaUi(page, person);
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.getByText("Staff", { exact: true }).first()).toBeVisible();
    });

    test("a sign-up cannot make itself an admin, whatever the request says", async () => {
        const anonymous = await request.newContext({ baseURL: `${API_URL}/` });
        const id = unique();
        const response = await anonymous.post("auth/register", {
            data: { name: "Sneaky", email: `sneaky-${id}@e2e.test`, password: "Sneaky12345", role: "ADMIN", status: "ACTIVE" }
        });
        // Either refused outright or accepted as an ordinary pending STAFF account; never as an admin
        if (response.ok()) {
            const admin = await apiAs("admin");
            const list = await (await admin.get(`users?search=sneaky-${id}`)).json();
            const created = list.data.users.find((user) => user.email === `sneaky-${id}@e2e.test`);
            expect(created.role).toBe("STAFF");
            expect(created.status).toBe("PENDING");
            await admin.dispose();
        }
        else {
            expect([400, 422]).toContain(response.status());
        }
        await anonymous.dispose();
    });
});

test.describe("losing the session", () => {
    test("deleting the cookie ends the session with a message, in the middle of using the app", async ({ page }) => {
        await loginViaUi(page, USERS.staff);
        await page.context().clearCookies();
        // A normal click inside the app: the next API call is answered 401 and the app must react
        await goToNav(page, "Catalog", "Products");

        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole("status")).toBeVisible();
    });

    test("opening the app with no cookie at all shows the login page", async ({ page }) => {
        await page.goto("/orders");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("changing a password on one device logs out every other device", async ({ browser }) => {
        const user = await makeUser();
        const newPassword = "Changed12345";

        // Two "devices": two separate browser contexts, each with its own cookie
        const deviceA = await (await browser.newContext()).newPage();
        const deviceB = await (await browser.newContext()).newPage();
        await loginViaUi(deviceA, user);
        await loginViaUi(deviceB, user);

        // Device A changes the password on the profile page
        await deviceA.goto("/profile");
        await deviceA.getByLabel("Current password").fill(user.password);
        await deviceA.getByLabel("New password", { exact: true }).fill(newPassword);
        await deviceA.getByLabel("Confirm new password").fill(newPassword);
        await deviceA.getByRole("button", { name: "Change password" }).click();
        await expect(deviceA).toHaveURL(/\/login$/);
        await expect(deviceA.getByRole("status")).toContainText("Password changed");

        // Device B still holds the old cookie: the very next request must be refused
        await goToNav(deviceB, "Catalog", "Products");
        await expect(deviceB).toHaveURL(/\/login$/);

        // The old password no longer works, the new one does
        await submitLoginForm(deviceB, user);
        await expect(deviceB.getByRole("alert")).toContainText("Invalid email or password");
        await loginViaUi(deviceB, { ...user, password: newPassword });
        // The app takes you back to the page you were trying to open (Products), otherwise to your home page
        await expect(deviceB).toHaveURL(/\/(dashboard|products)$/);

        await deviceA.context().close();
        await deviceB.context().close();
    });

    // The API side of a deactivation is solid: every request answers 403 ACCOUNT_INACTIVE and logging in again is refused.
    test("a deactivated account is refused by the API on every request and cannot log in again", async () => {
        const user = await makeUser();
        const own = await loginApi(user.email, user.password);
        expect((await own.get("products")).status()).toBe(200);

        const admin = await apiAs("admin");
        expect((await admin.delete(`users/${user._id}`)).ok()).toBe(true);
        await admin.dispose();

        for (const url of ["auth/me", "products", "notifications"]) {
            const response = await own.get(url);
            expect(response.status(), url).toBe(403);
            expect((await response.json()).error).toBe("ACCOUNT_INACTIVE");
        }
        await own.dispose();
        await expect(loginApi(user.email, user.password)).rejects.toThrow(/403.*deactivated/s);
    });

    // Was FINDING F1: the backend answers a deactivated user with 403 ACCOUNT_INACTIVE, and the frontend used to end
    // the session only on 401, leaving them inside the app with a dead-end error. Fixed in services/api.js.
    test("a deactivated user is sent to the login page on their next action, with the reason", async ({ page }) => {
        const user = await makeUser();
        await loginViaUi(page, user);

        const admin = await apiAs("admin");
        await admin.delete(`users/${user._id}`);
        await admin.dispose();

        await goToNav(page, "Catalog", "Products");

        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole("status")).toContainText("not active");
        expect(await tokenCookie(page)).toBeDefined(); // the browser still holds the (now useless) cookie; the API refuses it
        // ...and logging in again is refused with a clear reason
        await submitLoginForm(page, user);
        await expect(page.getByRole("alert")).toContainText("deactivated");
    });

    test("an ordinary permission error (403 for your role) does NOT log you out", async ({ page }) => {
        await loginViaUi(page, USERS.staff);

        // Staff may not list users: the API answers 403, and the person must stay logged in
        const status = await page.evaluate(async (apiUrl) => (await fetch(`${apiUrl}/users`, { credentials: "include" })).status, API_URL);
        expect(status).toBe(403);

        await page.reload();
        await expect(page.getByRole("navigation", { name: "App" })).toBeVisible();
        expect(await tokenCookie(page)).toBeDefined();
    });
});

test.describe("CORS", () => {
    test("the real frontend origin is allowed, with credentials; another website is not", async ({ playwright }) => {
        const anonymous = await playwright.request.newContext({ baseURL: `${API_URL}/` });

        // What the browser asks before a PUT / DELETE from the app
        for (const method of ["PUT", "DELETE"]) {
            const allowed = await anonymous.fetch("auth/me", {
                method: "OPTIONS",
                headers: { Origin: FRONTEND_URL, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "content-type" }
            });
            expect(allowed.headers()["access-control-allow-origin"]).toBe(FRONTEND_URL);
            expect(allowed.headers()["access-control-allow-credentials"]).toBe("true");
            expect(allowed.headers()["access-control-allow-methods"]).toContain(method);
        }

        const evil = await anonymous.fetch("auth/me", {
            method: "OPTIONS",
            headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" }
        });
        // The server names only ITS allowed origin (never "*", never the caller's), so a browser on another site refuses the answer
        const allowedForEvil = evil.headers()["access-control-allow-origin"];
        expect(allowedForEvil).not.toBe("https://evil.example");
        expect(allowedForEvil).not.toBe("*");
        await anonymous.dispose();
    });

    test("the app's own calls (PUT and DELETE with a JSON body) really work from the browser", async ({ page }) => {
        await loginViaUi(page, USERS.staff);

        // Same-origin rules of a real browser: preflight + cookie + JSON body, sent the way the app's axios sends it
        const result = await page.evaluate(async (apiUrl) => {
            const put = await fetch(`${apiUrl}/users/profile`, {
                method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9000000000" })
            });
            const del = await fetch(`${apiUrl}/orders/000000000000000000000000`, {
                method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "x" })
            });
            return { put: put.status, del: del.status };
        }, API_URL);

        expect(result.put).toBe(200);
        expect(result.del).toBe(404); // reached the API and its handler (no such order), not blocked by CORS
    });
});

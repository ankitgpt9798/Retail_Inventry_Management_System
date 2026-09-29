const { test, expect } = require("@playwright/test");
const { anonymousApi, apiAs, loginApi, statePath } = require("../helpers/api");
const { flash, loginViaUi, makeUser, submitLoginForm, tokenCookie, unique } = require("../helpers/ui");
const { readAs } = require("../helpers/data");

// Login guessing protection (was finding L2: no limit at all). Five wrong passwords lock an account for 15 minutes;
// while it is locked even the RIGHT password is refused. Tested in a real browser against the real API and database.
// (The stack's per-ADDRESS limit is raised for the suite, and covered by the backend tests.)

const LOCKED_MESSAGE = "Too many failed login attempts. Try again in 15 minutes.";

// One wrong-password login through the API; returns the response
const wrongPassword = async (email) => {
    const anonymous = await anonymousApi();
    const response = await anonymous.post("auth/login", { data: { email, password: `Wrong${unique()}Pass1` } });
    await anonymous.dispose();
    return response;
};
const guessTimes = async (email, times) => {
    const statuses = [];
    for (let attempt = 0; attempt < times; attempt++) statuses.push((await wrongPassword(email)).status());
    return statuses;
};
const loginStatus = async (email, password) => {
    const anonymous = await anonymousApi();
    const response = await anonymous.post("auth/login", { data: { email, password } });
    const result = { status: response.status(), headers: response.headers(), body: await response.json() };
    await anonymous.dispose();
    return result;
};

test.describe("locking an account", () => {
    test("5 wrong passwords are answered 401; the 6th is 429, and now even the RIGHT password is refused", async () => {
        const user = await makeUser();

        expect(await guessTimes(user.email, 5)).toEqual([401, 401, 401, 401, 401]);

        const wrong = await loginStatus(user.email, "WrongAgain123");
        expect(wrong.status).toBe(429);
        expect(wrong.body).toMatchObject({ success: false, error: "TOO_MANY_ATTEMPTS", message: LOCKED_MESSAGE });

        const right = await loginStatus(user.email, user.password);
        expect(right.status).toBe(429);
        expect(right.headers["set-cookie"]).toBeUndefined(); // no login cookie was handed out
    });

    test("the answer says when to try again, and still carries the protective headers", async () => {
        const user = await makeUser();
        await guessTimes(user.email, 5);

        const locked = await loginStatus(user.email, user.password);

        const retryAfter = Number(locked.headers["retry-after"]);
        expect(retryAfter).toBeGreaterThan(14 * 60);
        expect(retryAfter).toBeLessThanOrEqual(15 * 60);
        expect(locked.headers["x-content-type-options"]).toBe("nosniff");
        expect(locked.headers["cache-control"]).toBe("no-store");
    });

    test("in the real login page: the person is told clearly, stays logged out, and the form keeps working afterwards", async ({ page }) => {
        const user = await makeUser();
        await guessTimes(user.email, 5);

        await submitLoginForm(page, user); // even with the correct password

        await expect(page.getByRole("alert")).toContainText(LOCKED_MESSAGE);
        await expect(page).toHaveURL(/\/login$/);
        expect(await tokenCookie(page)).toBeUndefined();
        await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled(); // not stuck
    });

    test("an email that does not exist locks in EXACTLY the same way: the lock can't reveal who has an account", async () => {
        const real = await makeUser();
        const unknownEmail = `nobody-${unique()}@e2e.test`;

        const realStatuses = await guessTimes(real.email, 6);
        const unknownStatuses = await guessTimes(unknownEmail, 6);

        expect(unknownStatuses).toEqual(realStatuses);
        expect(unknownStatuses).toEqual([401, 401, 401, 401, 401, 429]);
        expect((await loginStatus(unknownEmail, "x")).body).toEqual((await loginStatus(real.email, "x")).body);
    });

    test("capital letters and spaces don't help an attacker: it is still the same account", async () => {
        const user = await makeUser();
        await guessTimes(user.email, 3);
        await guessTimes(user.email.toUpperCase(), 2);

        expect((await loginStatus(user.email, user.password)).status).toBe(429);
    });

    test("only that account is locked: everybody else can still log in, in the browser too", async ({ page }) => {
        const victim = await makeUser();
        const bystander = await makeUser();
        await guessTimes(victim.email, 5);

        expect((await loginStatus(victim.email, victim.password)).status).toBe(429);
        await loginViaUi(page, bystander);
        await expect(page).toHaveURL(/\/dashboard$/);
        // and the shared fixture users are untouched
        const staff = await loginApi("sunita@e2e.test", "Staff1234");
        expect((await staff.get("auth/me")).status()).toBe(200);
        await staff.dispose();
    });

    test("ordinary typos are fine: 4 wrong passwords then the right one works, and it starts the count again", async () => {
        const user = await makeUser();

        expect(await guessTimes(user.email, 4)).toEqual([401, 401, 401, 401]);
        expect((await loginStatus(user.email, user.password)).status).toBe(200);

        expect(await guessTimes(user.email, 4)).toEqual([401, 401, 401, 401]); // a fresh allowance, not 429
        expect((await loginStatus(user.email, user.password)).status).toBe(200);
    });

    test("a pending or deactivated person with the right password just gets their own message, never a lock", async () => {
        const user = await makeUser();
        const admin = await apiAs("admin");
        await admin.delete(`users/${user._id}`); // deactivate
        await admin.dispose();

        for (let attempt = 0; attempt < 7; attempt++) {
            const result = await loginStatus(user.email, user.password);
            expect(result.status).toBe(403);
            expect(result.body.error).toBe("ACCOUNT_INACTIVE");
        }
    });

    test("guesses sent all at once can't get past the limit: exactly 5 are checked, the rest are refused unchecked", async () => {
        const user = await makeUser();

        const responses = await Promise.all(Array.from({ length: 20 }, () => wrongPassword(user.email)));
        const statuses = responses.map((response) => response.status());

        expect(statuses.filter((status) => status === 401)).toHaveLength(5);
        expect(statuses.filter((status) => status === 429)).toHaveLength(15);
    });
});

test.describe("what the admin sees and can do", () => {
    test("the guessing is in the audit log (who, from where) and the moment the account locked is marked", async ({ browser }) => {
        const user = await makeUser();
        await guessTimes(user.email, 6);

        const { auditLogs } = await readAs("admin", `audit-logs?entityType=User&entityId=${user._id}&limit=50&sort=oldest`);
        const actions = auditLogs.map((entry) => entry.action);
        expect(actions.filter((action) => action === "LOGIN_FAILED")).toHaveLength(5); // the 6th was refused before any check
        expect(actions.filter((action) => action === "ACCOUNT_LOCKED")).toHaveLength(1);
        expect(actions.at(-1)).toBe("ACCOUNT_LOCKED");
        // (the first entry is the account being created; the guesses record where they came from)
        const firstGuess = auditLogs.find((entry) => entry.action === "LOGIN_FAILED");
        expect(firstGuess.metadata.ip).toBeTruthy();

        // ...and the admin can see it in the app
        const context = await browser.newContext({ storageState: statePath("admin") });
        const page = await context.newPage();
        await page.goto("/audit-logs");
        await page.getByRole("combobox", { name: "User" }).selectOption({ label: user.name });
        await expect(page.getByRole("row").filter({ hasText: "Login failed" })).toHaveCount(5);
        await expect(page.getByRole("row").filter({ hasText: "Account locked" })).toHaveCount(1);
        await context.close();
    });

    test("a locked-out person can be let back in at once: the admin resets their password", async ({ browser, page }) => {
        const user = await makeUser();
        await guessTimes(user.email, 5);
        expect((await loginStatus(user.email, user.password)).status).toBe(429);

        const context = await browser.newContext({ storageState: statePath("admin") });
        const admin = await context.newPage();
        await admin.goto("/users");
        await admin.getByRole("searchbox", { name: "Search" }).fill(user.email);
        await admin.getByRole("button", { name: `Reset password for ${user.name}` }).click();
        await admin.getByRole("dialog").getByLabel("New password", { exact: true }).fill("Unlocked12345");
        await admin.getByRole("dialog").getByLabel("Confirm new password").fill("Unlocked12345");
        await admin.getByRole("dialog").getByRole("button", { name: "Reset password" }).click();
        await expect(flash(admin, `Password reset for ${user.name}. They must log in again.`)).toBeVisible();
        await context.close();

        // No waiting: the new password works straight away, in the browser
        await loginViaUi(page, { ...user, password: "Unlocked12345" });
        await expect(page).toHaveURL(/\/dashboard$/);
    });
});

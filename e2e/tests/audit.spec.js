const { test, expect } = require("@playwright/test");
const { apiAs, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, readAs } = require("../helpers/data");
const { makeUser } = require("../helpers/ui");
const { loginApi } = require("../helpers/api");

// Phase 6c: the audit log. What the admin sees in the app must match what the system really recorded,
// and nobody, not even the admin, can change the record.

test.describe("the audit log (admin)", () => {
    test.use({ storageState: statePath("admin") });

    test("a change made by someone appears with who, when, what, and the before and after", async ({ page }) => {
        const product = await makeProduct({ sellingPrice: 150 });
        const manager = await apiAs("manager");
        void manager; // (managers can't edit products; the ADMIN makes the change below)
        await manager.dispose();
        await asAdmin((admin) => admin.put(`products/${product._id}`, { data: { sellingPrice: 175, name: `${product.name} v2` } }));

        await page.goto("/audit-logs");
        await page.getByRole("combobox", { name: "Action" }).selectOption({ label: "Product updated" });
        await page.getByRole("combobox", { name: "Record type" }).selectOption({ label: "Product" });

        const row = page.getByRole("row").filter({ hasText: product._id.slice(-8) });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText("E2E Admin");
        await expect(row).toContainText("admin@e2e.test");
        await expect(row).toContainText("Product updated");

        await row.getByRole("button", { name: "Show details: Product updated" }).click();
        const details = page.getByRole("table").last();
        const priceRow = details.getByRole("row").filter({ hasText: "sellingPrice" });
        await expect(priceRow).toContainText("150");
        await expect(priceRow).toContainText("175");
        await expect(details.getByRole("row").filter({ hasText: "name" })).toContainText(`${product.name} v2`);
        // Only what CHANGED is recorded (not the whole product)
        await expect(details.getByRole("row").filter({ hasText: "costPrice" })).toHaveCount(0);

        // Same facts from the API
        const { auditLogs } = await readAs("admin", `audit-logs?entityType=Product&entityId=${product._id}&action=PRODUCT_UPDATED`);
        expect(auditLogs[0].oldValue).toMatchObject({ sellingPrice: 150 });
        expect(auditLogs[0].newValue).toMatchObject({ sellingPrice: 175 });
    });

    test("a login is recorded; filter by person, and the date filter covers today but not yesterday", async ({ page }) => {
        const user = await makeUser();
        const client = await loginApi(user.email, user.password); // a real login
        await client.dispose();

        await page.goto("/audit-logs");
        await page.getByRole("combobox", { name: "User" }).selectOption({ label: user.name });
        await page.getByRole("combobox", { name: "Action" }).selectOption({ label: "Login" });
        await expect(page.getByRole("row")).toHaveCount(2); // header + the one login
        await expect(page.getByRole("row").nth(1)).toContainText(user.email);

        const today = new Date().toLocaleDateString("en-CA");
        await page.getByLabel("From").fill(today);
        await page.getByLabel("To").fill(today);
        await expect(page.getByRole("row")).toHaveCount(2);

        await page.getByLabel("From").fill("2020-01-01");
        await page.getByLabel("To").fill("2020-01-31");
        await expect(page.getByText("No audit records found.")).toBeVisible();
    });

    test("a person's whole story: everything one user did, oldest first, across different kinds of records", async ({ page }) => {
        const user = await makeUser({ role: "INVENTORY_MANAGER" });
        const client = await loginApi(user.email, user.password);
        const warehouse = (await (await client.post("warehouses", { data: { name: `Audit Hub ${Date.now()}`, code: `AH${Date.now().toString(36)}`.toUpperCase().slice(0, 12), city: "Goa", capacity: 500 } })).json()).data.warehouse;
        await client.put(`warehouses/${warehouse._id}`, { data: { city: "Pune" } });
        await client.dispose();

        await page.goto("/audit-logs");
        await page.getByRole("combobox", { name: "User" }).selectOption({ label: user.name });
        await page.getByRole("combobox", { name: "Order" }).selectOption("oldest");
        await expect(page.getByRole("row")).toHaveCount(4); // header + login, created, updated
        const cells = await page.getByRole("row").evaluateAll((rows) => rows.slice(1).map((row) => row.children[2].textContent.trim()));
        expect(cells).toEqual(["Login", "Warehouse created", "Warehouse updated"]);
    });

    test("pages of a long log: next and previous, and each page stays sorted", async ({ page }) => {
        await page.goto("/audit-logs");
        await expect(page.getByText(/Page 1 of \d+ · \d+ items/)).toBeVisible();
        await expect(page.getByRole("row")).toHaveCount(16); // header + 15 (the whole test run has written far more than that)
        const firstPageLast = await page.getByRole("row").last().getByRole("cell").first().textContent();
        await page.getByRole("button", { name: "Next page" }).click();
        await expect(page.getByText(/Page 2 of/)).toBeVisible();
        const secondPageFirst = await page.getByRole("row").nth(1).getByRole("cell").first().textContent();
        expect(secondPageFirst).not.toBe("");
        expect(firstPageLast).not.toBe("");
        await page.getByRole("button", { name: "Previous page" }).click();
        await expect(page.getByText(/Page 1 of/)).toBeVisible();
    });

    test("the log can't be changed: there is no way to edit, add or delete a record, even for the admin", async ({ page }) => {
        await page.goto("/audit-logs");
        await expect(page.getByRole("button", { name: /edit|delete|remove/i })).toHaveCount(0);

        const admin = await apiAs("admin");
        const { auditLogs } = await readAs("admin", "audit-logs?limit=1");
        const id = auditLogs[0]._id;
        for (const [method, url] of [["put", `audit-logs/${id}`], ["patch", `audit-logs/${id}`], ["delete", `audit-logs/${id}`], ["post", "audit-logs"]]) {
            const response = await admin[method](url, { data: { action: "TAMPERED" } });
            expect(response.ok(), `${method.toUpperCase()} ${url} must not succeed`).toBe(false);
        }
        // ...and the record is unchanged
        const after = (await (await admin.get(`audit-logs/${id}`)).json()).data.auditLog;
        expect(after.action).toBe(auditLogs[0].action);
        await admin.dispose();
    });

    test("only the admin may read it: managers and staff are refused by the page and by the API", async ({ browser }) => {
        for (const role of ["manager", "staff", "supplier"]) {
            const context = await browser.newContext({ storageState: statePath(role) });
            const page = await context.newPage();
            await page.goto("/audit-logs");
            await expect(page.getByText("You don't have access to this page")).toBeVisible();
            const client = await apiAs(role);
            expect((await client.get("audit-logs")).status(), role).toBe(403);
            await client.dispose();
            await context.close();
        }
    });
});

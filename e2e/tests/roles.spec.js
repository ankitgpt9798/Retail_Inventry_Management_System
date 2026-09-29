const { test, expect } = require("@playwright/test");
const { apiAs, anonymousApi, statePath } = require("../helpers/api");

// Phase 1b: who may see and do what, checked THREE ways for every role:
//   1. the navigation bar (which links exist)
//   2. the URL (opening a page directly)
//   3. the API itself (the real server must refuse, whatever the screen shows)
//
// The expectations below are written out by hand from the project specification, NOT read from the app's own
// permission tables, so a mistake in the app can't hide behind a copy of itself.

const ROLES = ["admin", "manager", "staff", "supplier"];

// page → who may open it, and the heading that proves it opened
const PAGES = [
    { path: "/dashboard", heading: /^Good (morning|afternoon|evening),/, roles: ["admin", "manager", "staff"] },
    { path: "/products", heading: "Products", roles: ["admin", "manager", "staff"] },
    { path: "/categories", heading: "Categories", roles: ["admin", "manager", "staff"] },
    { path: "/warehouses", heading: "Warehouses", roles: ["admin", "manager", "staff"] },
    { path: "/inventory", heading: "Inventory", roles: ["admin", "manager", "staff"] },
    { path: "/inventory/history", heading: "Stock history", roles: ["admin", "manager", "staff"] },
    { path: "/transfers", heading: "Transfers", roles: ["admin", "manager"] },
    { path: "/orders", heading: "Orders", roles: ["admin", "manager", "staff"] },
    { path: "/orders/new", heading: "New order", roles: ["admin", "staff"] },
    { path: "/fulfillment", heading: "Fulfillment", roles: ["admin", "manager", "staff"] },
    { path: "/suppliers", heading: "Suppliers", roles: ["admin", "manager"] },
    { path: "/purchases", heading: /^(Purchase orders|My purchase orders)$/, roles: ["admin", "manager", "supplier"] },
    { path: "/purchases/new", heading: "New purchase order", roles: ["admin", "manager"] },
    { path: "/reports", heading: "Reports", roles: ["admin", "manager"] },
    { path: "/users", heading: "Users", roles: ["admin"] },
    { path: "/audit-logs", heading: "Audit log", roles: ["admin"] },
    { path: "/notifications", heading: "Notifications", roles: ["admin", "manager", "staff", "supplier"] },
    { path: "/profile", heading: "My profile", roles: ["admin", "manager", "staff", "supplier"] }
];

// The links each role's navigation bar contains (in the drop-down menus too)
const NAV_LINKS = {
    admin: ["Dashboard", "Products", "Categories", "Inventory", "Warehouses", "Transfers", "Orders", "Fulfillment", "Suppliers", "Purchases", "Reports", "Users", "Audit log"],
    manager: ["Dashboard", "Products", "Categories", "Inventory", "Warehouses", "Transfers", "Orders", "Fulfillment", "Suppliers", "Purchases", "Reports"],
    staff: ["Dashboard", "Products", "Categories", "Inventory", "Warehouses", "Orders", "Fulfillment"],
    supplier: ["Purchases"]
};

for (const role of ROLES) {
    test.describe(`${role}: pages and navigation`, () => {
        test.use({ storageState: statePath(role) });

        test(`the navigation bar shows exactly the right links`, async ({ page }) => {
            await page.goto(role === "supplier" ? "/purchases" : "/dashboard");
            const bar = page.getByRole("navigation", { name: "App" });
            await expect(bar).toBeVisible();

            // A plain CSS selector, because role-based lookups skip the links inside closed drop-down menus
            const shown = (await bar.locator("a").allTextContents()).map((text) => text.trim());
            expect(shown.sort()).toEqual([...NAV_LINKS[role]].sort());
        });

        for (const { path, heading, roles } of PAGES) {
            const allowed = roles.includes(role);

            test(`${path} is ${allowed ? "open" : "closed"}`, async ({ page }) => {
                await page.goto(path);

                if (allowed) {
                    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
                    await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
                }
                else {
                    await expect(page.getByText("You don't have access to this page")).toBeVisible();
                    // ...and the page's own content never appeared, not even for a moment on the way
                    await expect(page.getByRole("heading", { level: 1, name: heading })).toHaveCount(0);
                }
            });
        }
    });
}

// ---------------- the API refuses on its own ----------------

// Read endpoints: who gets 200
const READS = [
    ["auth/me", ["admin", "manager", "staff", "supplier"]],
    ["notifications", ["admin", "manager", "staff", "supplier"]],
    ["notifications/unread-count", ["admin", "manager", "staff", "supplier"]],
    ["products", ["admin", "manager", "staff"]],
    ["categories", ["admin", "manager", "staff"]],
    ["warehouses", ["admin", "manager", "staff"]],
    ["inventory", ["admin", "manager", "staff"]],
    ["inventory/low-stock", ["admin", "manager", "staff"]],
    ["inventory/transactions", ["admin", "manager", "staff"]],
    ["orders", ["admin", "manager", "staff"]],
    ["orders/fulfillment-queue", ["admin", "manager", "staff"]],
    ["reports/dashboard", ["admin", "manager", "staff"]],
    ["reports/inventory", ["admin", "manager"]],
    ["reports/orders", ["admin", "manager"]],
    ["transfers", ["admin", "manager"]],
    ["suppliers", ["admin", "manager"]],
    ["purchases", ["admin", "manager", "supplier"]],
    ["users", ["admin"]],
    ["audit-logs", ["admin"]]
];

// Create endpoints, sent an EMPTY body on purpose: an allowed role gets "422 invalid" (the API's status for a body that
// fails validation; the request got past the permission check, and nothing is created); a forbidden role gets "403"
// BEFORE the body is even looked at.
const WRITES = [
    ["products", ["admin"]],
    ["categories", ["admin"]],
    ["warehouses", ["admin", "manager"]],
    ["suppliers", ["admin", "manager"]],
    ["users", ["admin"]],
    ["inventory/stock-in", ["admin", "manager"]],
    ["inventory/stock-out", ["admin", "manager"]],
    ["transfers", ["admin", "manager"]],
    ["orders", ["admin", "staff"]],
    ["purchases", ["admin", "manager"]]
];

test.describe("the API enforces roles by itself", () => {
    test("without a login every endpoint answers 401", async () => {
        const anonymous = await anonymousApi();
        for (const [url] of READS) {
            const response = await anonymous.get(url);
            expect(response.status(), `GET ${url}`).toBe(401);
        }
        for (const [url] of WRITES) {
            const response = await anonymous.post(url, { data: {} });
            expect(response.status(), `POST ${url}`).toBe(401);
        }
        await anonymous.dispose();
    });

    for (const role of ROLES) {
        test(`${role}: reads`, async () => {
            const client = await apiAs(role);
            for (const [url, allowed] of READS) {
                const response = await client.get(url);
                expect(response.status(), `${role} GET ${url}`).toBe(allowed.includes(role) ? 200 : 403);
            }
            await client.dispose();
        });

        test(`${role}: creates (empty body: 422 if allowed, 403 if not)`, async () => {
            const client = await apiAs(role);
            for (const [url, allowed] of WRITES) {
                const response = await client.post(url, { data: {} });
                expect(response.status(), `${role} POST ${url}`).toBe(allowed.includes(role) ? 422 : 403);
            }
            await client.dispose();
        });
    }

    test("a manager can view orders but not create, edit, confirm or cancel them", async () => {
        const manager = await apiAs("manager");
        const fakeId = "000000000000000000000000";
        for (const [method, url] of [["put", `orders/${fakeId}`], ["put", `orders/${fakeId}/confirm`], ["put", `orders/${fakeId}/status`], ["delete", `orders/${fakeId}`]]) {
            const response = await manager[method](url, { data: {} });
            expect(response.status(), `manager ${method.toUpperCase()} ${url}`).toBe(403);
        }
        await manager.dispose();
    });

    test("staff cannot approve transfers or purchases, and suppliers cannot run the buyer's workflow", async () => {
        const fakeId = "000000000000000000000000";
        const staff = await apiAs("staff");
        expect((await staff.put(`transfers/${fakeId}/approve`)).status()).toBe(403);
        expect((await staff.put(`purchases/${fakeId}/approve`)).status()).toBe(403);
        await staff.dispose();

        const supplier = await apiAs("supplier");
        for (const action of ["submit", "approve", "order", "receive", "cancel"]) {
            expect((await supplier.put(`purchases/${fakeId}/${action}`, { data: {} })).status(), `supplier ${action}`).toBe(403);
        }
        await supplier.dispose();

        // …and the buyer's people cannot use the supplier's portal actions
        const manager = await apiAs("manager");
        expect((await manager.put(`purchases/${fakeId}/confirm`, { data: {} })).status()).toBe(403);
        await manager.dispose();
    });
});

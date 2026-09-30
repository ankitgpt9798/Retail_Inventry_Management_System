const { test, expect } = require("@playwright/test");
const { apiAs, createVia, loginApi, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, makeWarehouse, readAs, stockIn } = require("../helpers/data");
const { makeUser, pagination } = require("../helpers/ui");

// Phase 6a: the notification inbox and the bell. A brand-new manager receives real notifications caused by
// real actions (purchase requests from another manager), then reads, filters and deletes them in the browser.

const bell = (page, count) => page.getByLabel(`Notifications, ${count} unread`);

// A new manager, and a way to open a browser logged in as them
const newManager = async () => {
    const user = await makeUser({ role: "INVENTORY_MANAGER" });
    const client = await loginApi(user.email, user.password);
    return { user, client };
};
const pageAs = async (browser, who) => {
    const context = await browser.newContext({ storageState: await who.client.storageState() });
    return { context, page: await context.newPage() };
};

// Ravi files `count` purchase requests; every other manager and the admin get "Purchase request needs approval"
const fileRequests = async (count) => {
    const { supplier } = await asAdmin((admin) => createVia(admin, "suppliers", { name: `E2E Notif Supplier ${Date.now()}${Math.random()}`.slice(0, 40), email: `notif-${Date.now()}${Math.floor(Math.random() * 1e6)}@e2e.test` }));
    const warehouse = await makeWarehouse();
    const product = await makeProduct();
    const ravi = await apiAs("manager");
    const purchases = [];
    for (let index = 0; index < count; index++) {
        const { purchase } = await createVia(ravi, "purchases", {
            supplier: supplier._id, warehouse: warehouse._id, items: [{ product: product._id, quantityOrdered: index + 1 }], submit: true
        });
        purchases.push(purchase);
    }
    await ravi.dispose();
    return purchases; // oldest first
};

test.describe("the inbox", () => {
    test("real notifications: counts, pages, reading, click-through, filters, mark all, delete, and the bell follows", async ({ browser }) => {
        const me = await newManager();
        const purchases = await fileRequests(12);
        const { context, page } = await pageAs(browser, me);

        // ---- The bell and the inbox agree on how many are unread ----
        await page.goto("/dashboard");
        await expect(bell(page, 12)).toBeVisible();
        await page.goto("/notifications");
        await expect(page.getByRole("tab", { name: "Unread (12)" })).toBeVisible();
        await expect(pagination(page)).toContainText("Showing 1–10 of 12");
        await expect(page.locator("main article")).toHaveCount(10);
        await page.getByRole("button", { name: "Next page" }).click();
        await expect(pagination(page)).toContainText("Showing 11–12 of 12");
        await expect(page.locator("main article")).toHaveCount(2);
        await page.getByRole("button", { name: "Previous page" }).click();

        // ---- Newest first, and clicking one reads it and opens the order it is about ----
        const newest = purchases.at(-1);
        const first = page.locator("main article").first();
        await expect(first).toContainText("Purchase request needs approval");
        await expect(first).toContainText(newest.poNumber);
        await first.getByRole("button").first().click();
        await expect(page).toHaveURL(new RegExp(`/purchases/${newest._id}$`));
        await expect(page.getByRole("heading", { level: 1, name: newest.poNumber })).toBeVisible();
        await expect(bell(page, 11)).toBeVisible(); // read → the bell went down by one without a reload

        // ---- Filters ----
        await page.goto("/notifications");
        await page.getByRole("tab", { name: "Unread (11)" }).click();
        await expect(pagination(page)).toContainText("Showing 1–10 of 11");
        await page.getByRole("combobox", { name: "Type" }).selectOption("LOW_STOCK");
        await expect(page.getByRole("main").getByText("You're all caught up.")).toBeVisible();
        await page.getByRole("combobox", { name: "Type" }).selectOption("PURCHASE_UPDATE");
        await expect(pagination(page)).toContainText("Showing 1–10 of 11");
        await page.getByRole("combobox", { name: "Type" }).selectOption("");

        // ---- "Mark read" alone does not open the linked page ----
        await page.getByRole("button", { name: /^Mark "Purchase request needs approval" as read$/ }).first().click();
        await expect(page).toHaveURL(/\/notifications$/);
        await expect(bell(page, 10)).toBeVisible();

        // ---- The bell's drop-down shows the latest five and links to the inbox ----
        await page.getByLabel(/^Notifications, /).click();
        await expect(page.getByRole("link", { name: "View all notifications" })).toHaveAttribute("href", "/notifications");
        await page.keyboard.press("Escape");

        // ---- Delete one: it is really gone ----
        const total = async () => (await (await me.client.get("notifications?limit=1")).json()).data.pagination.total;
        expect(await total()).toBe(12);
        await page.getByRole("tab", { name: /^All$/ }).click();
        await page.getByRole("button", { name: /^Delete "Purchase request needs approval"$/ }).first().click();
        await expect.poll(total).toBe(11);

        // ---- Mark all as read: nothing unread anywhere ----
        await page.getByRole("main").getByRole("button", { name: /mark all as read/i }).click();
        await expect(bell(page, 0)).toBeVisible();
        expect((await (await me.client.get("notifications/unread-count")).json()).data.unreadCount).toBe(0);
        await expect(page.getByRole("main").getByRole("button", { name: /mark all as read/i })).toBeDisabled();
        await page.getByRole("tab", { name: "Unread" }).click();
        await expect(page.getByRole("main").getByText("You're all caught up.")).toBeVisible();

        await context.close();
    });

    test("notifications are private: nobody can read, change or delete someone else's", async () => {
        const me = await newManager();
        await fileRequests(1);
        const mine = (await (await me.client.get("notifications")).json()).data.notifications[0];
        expect(mine).toBeTruthy();

        // Staff (another person) gets 404, as if it did not exist, for both read-marking and deleting
        const staff = await apiAs("staff");
        expect((await staff.put(`notifications/${mine._id}/read`)).status()).toBe(404);
        expect((await staff.delete(`notifications/${mine._id}`)).status()).toBe(404);
        // ...and their own list never contains mine
        const theirs = (await (await staff.get("notifications?limit=100")).json()).data.notifications;
        expect(theirs.find((note) => note._id === mine._id)).toBeUndefined();
        await staff.dispose();

        // Still intact and unread for the owner
        const still = (await (await me.client.get("notifications")).json()).data.notifications.find((note) => note._id === mine._id);
        expect(still.isRead).toBe(false);
    });

    test("who gets alerted: managers and admin for purchase requests; staff and suppliers do not", async () => {
        const purchases = await fileRequests(1);
        const po = purchases[0].poNumber;
        const has = async (role) => (await readAs(role, "notifications?limit=100")).notifications.some((note) => note.message.includes(po));

        expect(await has("manager2")).toBe(true);
        expect(await has("admin")).toBe(true);
        expect(await has("manager")).toBe(false); // Ravi filed it himself
        expect(await has("staff")).toBe(false);
        expect(await has("supplier")).toBe(false);
    });
});

// ======================================================================================
// Was FINDING F2: low-stock notifications linked to /inventory/<id> and transfer notifications to
// /inventory/transfers/<id>, neither of which is a page in the app, so clicking them landed on "Page not found".
// Fixed at the source (the links are now /inventory and /transfers). This checks EVERY kind of link the system
// produces against the app's real pages, so a wrong link can't come back unnoticed.
test.describe("where notifications lead", () => {
    // The pages that exist in the app (written by hand from the page list, not read from the app's route table)
    const REAL_PAGES = [/^\/orders\/[0-9a-f]{24}$/, /^\/purchases\/[0-9a-f]{24}$/, /^\/inventory$/, /^\/transfers$/, /^\/fulfillment$/, /^\/products$/];

    test("every link in every kind of notification opens a real page", async ({ browser }) => {
        // Produce one notification of each kind that carries a link
        const product = await makeProduct();
        const source = await makeWarehouse();
        const destination = await makeWarehouse();
        await stockIn({ product, warehouse: source, quantity: 30 });
        const inventory = (await readAs("admin", `inventory?product=${product._id}&warehouse=${source._id}`)).inventories[0];
        await asAdmin((admin) => admin.put(`inventory/${inventory._id}/reorder-level`, { data: { reorderLevel: 25 } }));
        const manager = await apiAs("manager");
        await manager.post("inventory/stock-out", { data: { product: product._id, warehouse: source._id, quantity: 10, note: "sale" } }); // low stock
        await manager.post("transfers", { data: { product: product._id, fromWarehouse: source._id, toWarehouse: destination._id, quantity: 5 } }); // transfer
        await manager.dispose();
        await fileRequests(1); // purchase

        const notes = (await readAs("manager2", "notifications?limit=100")).notifications.filter((note) => note.link);
        expect(notes.length).toBeGreaterThan(2);

        const context = await browser.newContext({ storageState: statePath("manager2") });
        const page = await context.newPage();
        const broken = [];
        const seen = new Set();
        for (const note of notes) {
            const pattern = note.link.replace(/[0-9a-f]{24}/g, ":id");
            if (seen.has(pattern)) continue;
            seen.add(pattern);
            await page.goto(note.link);
            await page.waitForLoadState("networkidle");
            const notFound = await page.getByRole("heading", { name: "Page not found" }).count();
            if (notFound > 0 || !REAL_PAGES.some((real) => real.test(new URL(page.url()).pathname))) broken.push(`${note.title}: ${note.link}`);
        }
        await context.close();

        expect(broken, `notification links that lead nowhere:\n${broken.join("\n")}`).toEqual([]);
    });

    test("meanwhile, the links that do work: an order or purchase notification opens that record", async ({ browser }) => {
        const purchases = await fileRequests(1);
        const context = await browser.newContext({ storageState: statePath("manager2") });
        const page = await context.newPage();
        await page.goto("/notifications");
        await page.locator("main article").filter({ hasText: purchases[0].poNumber }).getByText("Purchase request needs approval").click();
        await expect(page.getByRole("heading", { level: 1, name: purchases[0].poNumber })).toBeVisible();
        await context.close();
    });
});

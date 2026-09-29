const { test, expect } = require("@playwright/test");
const { USERS } = require("../config");
const { apiAs, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, makeWarehouse, readAs, stockIn } = require("../helpers/data");
const { flash } = require("../helpers/ui");

// Phase 3a: inventory. Stock in and out, capacity, reserved stock, low-stock alerts and the movement history:
// clicked through in the real app, then checked in the real database.

const rowOf = (page, text) => page.getByRole("row").filter({ hasText: text });
const optionLabel = (product) => `${product.name} (${product.sku})`;
const warehouseLabel = (warehouse) => `${warehouse.name} (${warehouse.code})`;

// The single inventory record of a product in a warehouse, straight from the API
const stockOf = async (product, warehouse) => {
    const { inventories } = await readAs("admin", `inventory?product=${product._id}&warehouse=${warehouse._id}`);
    return inventories[0];
};

// Opens the Stock in / Stock out pop-up from the header and fills it
const fillMovement = async (page, { button, product, warehouse, quantity, note }) => {
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Product").selectOption({ label: optionLabel(product) });
    await dialog.getByLabel("Warehouse").selectOption({ label: warehouseLabel(warehouse) });
    await dialog.getByLabel("Quantity").fill(String(quantity));
    if (note !== undefined) await dialog.getByLabel(button === "Stock out" ? "Reason" : "Note (optional)").fill(note);
    return dialog;
};

test.describe("stock in and out (inventory manager)", () => {
    test.use({ storageState: statePath("manager") });

    test("stock in adds to the warehouse; the table, the database and the history all agree", async ({ page }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse({ capacity: 100 });
        await page.goto("/inventory");

        const dialog = await fillMovement(page, { button: "Stock in", product, warehouse, quantity: 30, note: "First delivery" });
        await dialog.getByRole("button", { name: "Add stock" }).click();
        await expect(flash(page, "Stock added.")).toBeVisible();

        await page.getByRole("searchbox", { name: "Search" }).fill(product.sku);
        const row = rowOf(page, product.sku);
        await expect(row).toContainText(warehouse.name);
        await expect(row.getByRole("cell").nth(2)).toHaveText("30"); // on hand
        await expect(row.getByRole("cell").nth(3)).toHaveText("0"); // reserved
        await expect(row.getByRole("cell").nth(4)).toContainText("30"); // available

        expect(await stockOf(product, warehouse)).toMatchObject({ quantity: 30, reservedQuantity: 0, availableQuantity: 30 });

        // A second delivery adds on top
        const again = await fillMovement(page, { button: "Stock in", product, warehouse, quantity: 20 });
        await again.getByRole("button", { name: "Add stock" }).click();
        await expect(flash(page, "Stock added.")).toBeVisible();
        expect((await stockOf(product, warehouse)).quantity).toBe(50);

        // History: both movements with before → after, who did it, and the note
        await page.goto("/inventory/history");
        await page.getByRole("combobox", { name: "Warehouse" }).selectOption({ label: warehouse.name });
        await expect(page.getByRole("row")).toHaveCount(3); // header + 2
        const newest = page.getByRole("row").nth(1);
        await expect(newest).toContainText("Stock in");
        await expect(newest).toContainText("+20");
        await expect(newest).toContainText("30 → 50");
        await expect(newest).toContainText(USERS.manager.name);
        await expect(page.getByRole("row").nth(2)).toContainText("0 → 30");
        await expect(page.getByRole("row").nth(2)).toContainText("First delivery");
    });

    test("stock in beyond the warehouse's capacity is refused, and nothing changes", async ({ page }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse({ capacity: 100 });
        await stockIn({ product, warehouse, quantity: 50 });
        await page.goto("/inventory");

        const dialog = await fillMovement(page, { button: "Stock in", product, warehouse, quantity: 80 });
        await dialog.getByRole("button", { name: "Add stock" }).click();

        await expect(dialog.getByRole("alert")).toContainText(`${warehouse.code} can hold 100 units and has 50; only 50 more will fit`);
        expect((await stockOf(product, warehouse)).quantity).toBe(50);
    });

    test("stock out needs a reason, cannot take more than is available, and otherwise removes stock", async ({ page }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 50 });
        await page.goto("/inventory");

        // No reason: stopped in the form
        const dialog = await fillMovement(page, { button: "Stock out", product, warehouse, quantity: 5 });
        await dialog.getByRole("button", { name: "Remove stock" }).click();
        await expect(dialog.getByText(/give a reason/i)).toBeVisible();

        // More than available: the server refuses, with the numbers
        await dialog.getByLabel("Quantity").fill("60");
        await dialog.getByLabel("Reason").fill("damaged in transit");
        await dialog.getByRole("button", { name: "Remove stock" }).click();
        await expect(dialog.getByRole("alert")).toContainText(`Insufficient stock of ${product.sku} in ${warehouse.code}: 50 available, 60 requested`);
        expect((await stockOf(product, warehouse)).quantity).toBe(50);

        // A valid removal
        await dialog.getByLabel("Quantity").fill("20");
        await dialog.getByRole("button", { name: "Remove stock" }).click();
        await expect(flash(page, "Stock removed.")).toBeVisible();
        expect((await stockOf(product, warehouse)).quantity).toBe(30);

        await page.goto("/inventory/history");
        await page.getByRole("combobox", { name: "Warehouse" }).selectOption({ label: warehouse.name });
        await page.getByRole("combobox", { name: "Type" }).selectOption("STOCK_OUT");
        await expect(page.getByRole("row")).toHaveCount(2);
        const row = page.getByRole("row").nth(1);
        await expect(row).toContainText("−20");
        await expect(row).toContainText("50 → 30");
        await expect(row).toContainText("damaged in transit");
    });

    test("a row's In and Out buttons start with that product and warehouse already chosen", async ({ page }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 10 });
        await page.goto("/inventory");
        await page.getByRole("searchbox", { name: "Search" }).fill(product.sku);

        await page.getByRole("button", { name: `Add stock to ${product.name} in ${warehouse.name}` }).click();
        await expect(page.getByRole("dialog").getByLabel("Product")).toHaveValue(product._id);
        await expect(page.getByRole("dialog").getByLabel("Warehouse")).toHaveValue(warehouse._id);
    });

    test("inactive products and warehouses cannot be chosen", async ({ page }) => {
        const inactiveProduct = await makeProduct();
        const activeProduct = await makeProduct();
        const inactiveWarehouse = await makeWarehouse();
        await asAdmin(async (admin) => {
            await admin.delete(`products/${inactiveProduct._id}`);
            await admin.delete(`warehouses/${inactiveWarehouse._id}`);
        });

        await page.goto("/inventory");
        await page.getByRole("button", { name: "Stock in", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByLabel("Product").locator("option").filter({ hasText: activeProduct.sku })).toHaveCount(1);
        await expect(dialog.getByLabel("Product").locator("option").filter({ hasText: inactiveProduct.sku })).toHaveCount(0);
        await expect(dialog.getByLabel("Warehouse").locator("option").filter({ hasText: inactiveWarehouse.code })).toHaveCount(0);
    });

    test("two people removing stock at the same moment can never oversell it", async () => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 50 });

        const manager = await apiAs("manager");
        const manager2 = await apiAs("manager2");
        const body = { data: { product: product._id, warehouse: warehouse._id, quantity: 30, note: "race" } };
        const [one, two] = await Promise.all([manager.post("inventory/stock-out", body), manager2.post("inventory/stock-out", body)]);

        expect([one.status(), two.status()].sort()).toEqual([200, 400]); // exactly one wins, the other is told "insufficient stock"
        expect((await stockOf(product, warehouse)).quantity).toBe(20); // 50 - 30, never 50 - 60
        await manager.dispose();
        await manager2.dispose();
    });
});

test.describe("reorder level and low-stock alerts", () => {
    test("editing a reorder level flags the row; crossing it once alerts every manager and admin exactly once", async ({ browser }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 30 });

        // Ravi (manager) sets the reorder level in the UI
        const raviContext = await browser.newContext({ storageState: statePath("manager") });
        const ravi = await raviContext.newPage();
        await ravi.goto("/inventory");
        await ravi.getByRole("searchbox", { name: "Search" }).fill(product.sku);
        await expect(rowOf(ravi, product.sku)).not.toContainText("Low stock");

        await ravi.getByRole("button", { name: `Edit reorder level of ${product.name} in ${warehouse.name}` }).click();
        await ravi.getByRole("dialog").getByLabel("Reorder level").fill("25");
        await ravi.getByRole("dialog").getByRole("button", { name: "Save" }).click();
        await expect(flash(ravi, "Reorder level updated.")).toBeVisible();
        expect((await stockOf(product, warehouse)).reorderLevel).toBe(25);
        await expect(rowOf(ravi, product.sku)).not.toContainText("Low stock"); // 30 available, level 25

        const lowStockNotes = async (role) =>
            (await readAs(role, "notifications?type=LOW_STOCK&limit=100")).notifications.filter((note) => note.message.includes(product.sku));
        expect(await lowStockNotes("manager2")).toHaveLength(0);

        // Stock out 10 → 20 available, below the level: the alert fires
        const dialog = await fillMovement(ravi, { button: "Stock out", product, warehouse, quantity: 10, note: "sold in shop" });
        await dialog.getByRole("button", { name: "Remove stock" }).click();
        await expect(flash(ravi, "Stock removed.")).toBeVisible();
        await expect(rowOf(ravi, product.sku)).toContainText("Low stock");

        for (const role of ["manager", "manager2", "admin"]) {
            const notes = await lowStockNotes(role);
            expect(notes, `${role} should get one low-stock alert`).toHaveLength(1);
            expect(notes[0].message).toContain(`${warehouse.code}: 20 available, reorder level 25`);
            expect(notes[0].isRead).toBe(false);
        }
        // Staff and suppliers are not alerted
        expect(await lowStockNotes("staff")).toHaveLength(0);

        // Already low: taking more out must NOT alert again (an alert per crossing, not per movement)
        const again = await fillMovement(ravi, { button: "Stock out", product, warehouse, quantity: 5, note: "sold again" });
        await again.getByRole("button", { name: "Remove stock" }).click();
        await expect(flash(ravi, "Stock removed.")).toBeVisible();
        expect(await lowStockNotes("manager2")).toHaveLength(1);

        // The low-stock filter finds it
        await ravi.getByLabel("Low stock only").check();
        await expect(rowOf(ravi, product.sku)).toBeVisible();
        await raviContext.close();
    });

    test("the alert shows in the other manager's bell, and the unread number goes down when it is read", async ({ browser }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 30 });
        const inventory = await stockOf(product, warehouse);
        await asAdmin((admin) => admin.put(`inventory/${inventory._id}/reorder-level`, { data: { reorderLevel: 25 } }));

        const nehaContext = await browser.newContext({ storageState: statePath("manager2") });
        const neha = await nehaContext.newPage();
        await neha.goto("/dashboard");
        const before = Number(/(\d+) unread/.exec(await neha.getByLabel(/^Notifications, /).getAttribute("aria-label"))[1]);

        const manager = await apiAs("manager");
        await manager.post("inventory/stock-out", { data: { product: product._id, warehouse: warehouse._id, quantity: 10, note: "sale" } });
        await manager.dispose();

        // The bell polls once a minute; a reload asks straight away
        await neha.reload();
        await expect(neha.getByLabel(`Notifications, ${before + 1} unread`)).toBeVisible();

        await neha.goto("/notifications");
        const item = neha.getByRole("listitem").filter({ hasText: product.sku });
        await expect(item).toContainText("Low stock");
        await item.getByRole("button", { name: /Mark ".*" as read/ }).click();
        await expect(neha.getByLabel(`Notifications, ${before} unread`)).toBeVisible();
        await nehaContext.close();
    });

    // FINDING F2 (reported, not fixed): the backend puts the link /inventory/<id> in every low-stock notification,
    // but the app has no page at that address (the inventory list is /inventory), so clicking the notification
    // lands on the "page not found" screen. Expected failure until the link or the route is fixed.
    test("clicking a low-stock notification opens the inventory page", async ({ browser }) => {
        test.fail(true, "F2: the notification links to /inventory/<id>, which is not a page in the app");

        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 30 });
        const inventory = await stockOf(product, warehouse);
        await asAdmin((admin) => admin.put(`inventory/${inventory._id}/reorder-level`, { data: { reorderLevel: 25 } }));
        const manager = await apiAs("manager");
        await manager.post("inventory/stock-out", { data: { product: product._id, warehouse: warehouse._id, quantity: 10, note: "sale" } });
        await manager.dispose();

        const context = await browser.newContext({ storageState: statePath("manager2") });
        const page = await context.newPage();
        await page.goto("/notifications");
        await page.getByRole("listitem").filter({ hasText: product.sku }).getByText("Low stock", { exact: true }).first().click();

        await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible({ timeout: 4000 });
        await context.close();
    });
});

test.describe("stock history filters", () => {
    test.use({ storageState: statePath("manager") });

    test("type, warehouse and date filters narrow the list (and the end date covers the whole day)", async ({ page }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 40 });
        const manager = await apiAs("manager");
        await manager.post("inventory/stock-out", { data: { product: product._id, warehouse: warehouse._id, quantity: 5, note: "one" } });
        await manager.dispose();

        await page.goto("/inventory/history");
        await page.getByRole("combobox", { name: "Warehouse" }).selectOption({ label: warehouse.name });
        await expect(page.getByRole("row")).toHaveCount(3);

        await page.getByRole("combobox", { name: "Type" }).selectOption("STOCK_IN");
        await expect(page.getByRole("row")).toHaveCount(2);
        await expect(page.getByRole("row").nth(1)).toContainText("+40");
        await page.getByRole("combobox", { name: "Type" }).selectOption("");

        // Today, both ends: everything that happened today is included, even things from a moment ago
        const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the computer's own time zone
        await page.getByLabel("From").fill(today);
        await page.getByLabel("To").fill(today);
        await expect(page.getByRole("row")).toHaveCount(3);

        // A range that ended yesterday contains nothing
        const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString("en-CA");
        await page.getByLabel("From").fill("2020-01-01");
        await page.getByLabel("To").fill(yesterday);
        await expect(page.getByText("No stock movements found.")).toBeVisible();
    });
});

test.describe("staff", () => {
    test.use({ storageState: statePath("staff") });

    test("can look at stock and its history, but has no way to change it", async ({ page }) => {
        const product = await makeProduct();
        const warehouse = await makeWarehouse();
        await stockIn({ product, warehouse, quantity: 12 });

        await page.goto("/inventory");
        await page.getByRole("searchbox", { name: "Search" }).fill(product.sku);
        await expect(rowOf(page, product.sku)).toContainText("12");
        await expect(page.getByRole("button", { name: /^Stock (in|out)$/ })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Edit reorder level|Add stock to|Remove stock from/ })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Stock history" })).toBeVisible();

        await page.getByRole("link", { name: "Stock history" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Stock history" })).toBeVisible();
    });
});

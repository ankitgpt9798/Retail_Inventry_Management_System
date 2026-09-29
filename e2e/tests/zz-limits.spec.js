const { test, expect } = require("@playwright/test");
const { apiAs, createVia, statePath } = require("../helpers/api");
const { asAdmin, makeCategory, makeWarehouse } = require("../helpers/data");
const { unique } = require("../helpers/ui");

// Runs LAST (the file name sorts last): it fills the database with 105 products, which would slow every test after it.

test.describe("size limits", () => {
    test.use({ storageState: statePath("staff") });

    // FINDING F3 (reported, not fixed). Every drop-down in the app (products in the order, stock and transfer forms;
    // suppliers and warehouses in the purchase form) loads only the FIRST 100 items, because that is the most the API
    // returns per request, and nothing loads the rest. With more than 100 active products, the older ones simply
    // cannot be picked when writing an order, so they cannot be sold through the app.
    // This test is expected to fail until the drop-downs are fixed (search-as-you-type, or loading every page).
    test("F3: with more than 100 products, every product can still be chosen when writing an order", async ({ page }) => {
        test.fail(true, "F3: drop-downs show only the first 100 items, so older products can't be chosen");
        test.setTimeout(120_000);

        const category = await makeCategory();
        const warehouse = await makeWarehouse();
        const admin = await apiAs("admin");
        const tag = unique();
        let oldest;
        for (let index = 0; index < 105; index++) {
            const { product } = await createVia(admin, "products", {
                name: `Limit Product ${tag} ${String(index).padStart(3, "0")}`,
                sku: `LIM-${tag}-${index}`.toUpperCase(),
                category: category._id,
                costPrice: 10,
                sellingPrice: 20
            });
            if (index === 0) oldest = product; // created first = "oldest": the one that falls off the end of a newest-first list of 100
        }
        await admin.dispose();
        void warehouse;

        await page.goto("/orders/new");
        const options = page.getByLabel("Product 1").locator("option");
        await expect(options.first()).toBeAttached();
        await expect(options.filter({ hasText: oldest.sku }), "the oldest of 105 products should be selectable").toHaveCount(1, { timeout: 4000 });
    });

    test("meanwhile the API itself never returns more than 100 per page (which is where the limit comes from)", async () => {
        const admin = await apiAs("admin");
        const tooMany = await admin.get("products?limit=101");
        expect(tooMany.status()).toBe(422);
        expect((await tooMany.json()).message).toContain("Limit cannot be more than 100");
        await admin.dispose();
        void asAdmin;
    });
});

const { test, expect } = require("@playwright/test");
const { apiAs, createVia, statePath } = require("../helpers/api");
const { makeCategory } = require("../helpers/data");
const { unique } = require("../helpers/ui");

// Runs LAST (the file name sorts last): it fills the database with 105 products and 105 warehouses,
// which would slow every test after it.

// Was FINDING F3: every drop-down loaded only the FIRST 100 items (the API's maximum per request) and nothing
// loaded the rest, so with more than 100 active products the older ones could not be chosen when writing an order,
// and the same for warehouses and suppliers. Fixed at the source: `useOptions` now loads every page.
test.describe("lists longer than one page of 100", () => {
    test.describe("products in the order form", () => {
        test.use({ storageState: statePath("staff") });

        test("with more than 100 products, EVERY product can still be chosen when writing an order", async ({ page }) => {
            test.setTimeout(120_000);

            const category = await makeCategory();
            const admin = await apiAs("admin");
            const tag = unique();
            let oldest;
            let newest;
            for (let index = 0; index < 105; index++) {
                const { product } = await createVia(admin, "products", {
                    name: `Limit Product ${tag} ${String(index).padStart(3, "0")}`,
                    sku: `LIM-${tag}-${index}`.toUpperCase(),
                    category: category._id,
                    costPrice: 10,
                    sellingPrice: 20
                });
                if (index === 0) oldest = product; // created first: in a newest-first list of 100 it falls off the end
                newest = product;
            }
            await admin.dispose();

            await page.goto("/orders/new");
            const options = page.getByLabel("Product 1").locator("option");
            await expect(options.filter({ hasText: newest.sku })).toHaveCount(1);
            await expect(options.filter({ hasText: oldest.sku }), "the oldest of 105 products should be selectable").toHaveCount(1);
        });
    });

    test.describe("warehouses in the stock form", () => {
        test.use({ storageState: statePath("manager") });

        test("with more than 100 warehouses, EVERY warehouse can still be chosen", async ({ page }) => {
            test.setTimeout(120_000);

            const admin = await apiAs("admin");
            const tag = unique();
            let last;
            for (let index = 0; index < 105; index++) {
                // Warehouses are listed by NAME, so these are named to sort AFTER everything else: the one place the old cut-off hurt
                const { warehouse } = await createVia(admin, "warehouses", {
                    name: `zzz Limit Warehouse ${tag} ${String(index).padStart(3, "0")}`,
                    code: `Z${tag}${index}`.toUpperCase().slice(0, 18),
                    city: "Delhi",
                    capacity: 100
                });
                last = warehouse;
            }
            await admin.dispose();

            await page.goto("/inventory");
            await page.getByRole("button", { name: "Stock in", exact: true }).click();
            const options = page.getByRole("dialog").getByLabel("Warehouse").locator("option");
            await expect(options.filter({ hasText: last.code }), "the last of 105 warehouses should be selectable").toHaveCount(1);
        });
    });

    test.describe("the API's own limit (where the old problem came from)", () => {
        test.use({ storageState: statePath("admin") });

        test("the API never returns more than 100 per page, so the app has to ask for the rest", async () => {
            const admin = await apiAs("admin");
            const tooMany = await admin.get("products?limit=101");
            expect(tooMany.status()).toBe(422);
            expect((await tooMany.json()).message).toContain("Limit cannot be more than 100");

            // ...and it says how many pages there are, which is what the app now uses
            const first = (await (await admin.get("products?limit=100&page=1")).json()).data;
            expect(first.pagination.totalPages).toBeGreaterThanOrEqual(2);
            await admin.dispose();
        });
    });
});

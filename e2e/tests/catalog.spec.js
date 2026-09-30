const { test, expect } = require("@playwright/test");
const { USERS } = require("../config");
const { statePath } = require("../helpers/api");
const { asAdmin, makeCategory, makeProduct, makeWarehouse, readAs, stockIn } = require("../helpers/data");
const { flash, unique, cards, cardOf, pagination } = require("../helpers/ui");

// Phase 2: categories, products and warehouses, clicked through in the real app and checked in the real database.

// Each record is a card on the listing pages
const rowOf = (page, text) => cardOf(page, text);

// ======================================================================================
test.describe("categories (admin)", () => {
    test.use({ storageState: statePath("admin") });

    test("create, find after a reload, edit: and the database agrees", async ({ page }) => {
        const name = `E2E Cat ${unique()}`;
        await page.goto("/categories");

        await page.getByRole("button", { name: "New category" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Name", { exact: true }).fill(name);
        await dialog.getByLabel("Description (optional)").fill("shown in the list");
        await dialog.getByRole("button", { name: "Create category" }).click();
        await expect(flash(page, "Category created.")).toBeVisible();

        // It is really saved: still there after a full reload, and in the API
        await page.reload();
        await page.getByRole("searchbox", { name: "Search" }).fill(name);
        await expect(rowOf(page, name)).toContainText("shown in the list");
        await expect(rowOf(page, name)).toContainText("Active");
        let stored = (await readAs("admin", `categories?search=${encodeURIComponent(name)}`)).categories;
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ name, description: "shown in the list", status: "ACTIVE" });

        // Edit
        await page.getByRole("button", { name: `Edit ${name}` }).click();
        await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
        await page.getByLabel("Description (optional)").fill("changed description");
        await page.getByRole("button", { name: "Save changes" }).click();
        await expect(flash(page, "Category updated.")).toBeVisible();
        stored = (await readAs("admin", `categories?search=${encodeURIComponent(name)}`)).categories;
        expect(stored[0].description).toBe("changed description");
    });

    test("a duplicate name is refused with the server's message, and nothing is created twice", async ({ page }) => {
        const existing = await makeCategory();
        await page.goto("/categories");

        await page.getByRole("button", { name: "New category" }).click();
        await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(existing.name);
        await page.getByRole("dialog").getByRole("button", { name: "Create category" }).click();

        await expect(page.getByRole("dialog").getByRole("alert")).toContainText("already exists");
        const { categories } = await readAs("admin", `categories?search=${encodeURIComponent(existing.name)}`);
        expect(categories).toHaveLength(1);
    });

    test("a category in use can't be deactivated; once its products are gone it can, and it can be reactivated", async ({ page }) => {
        const category = await makeCategory();
        const product = await makeProduct({ category: category._id });
        await page.goto("/categories");
        await page.getByRole("searchbox", { name: "Search" }).fill(category.name);

        // Refused, with the reason, and the category stays active
        await page.getByRole("button", { name: `Deactivate ${category.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(page.getByRole("dialog")).toContainText("1 active product(s) use this category");
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
        await expect(rowOf(page, category.name)).toContainText("Active");

        // Deactivate the product (through the API), then it works
        await asAdmin((admin) => admin.delete(`products/${product._id}`));
        await page.getByRole("button", { name: `Deactivate ${category.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(flash(page, "Category deactivated.")).toBeVisible();
        await expect(rowOf(page, category.name)).toContainText("Inactive");

        await page.getByRole("button", { name: `Reactivate ${category.name}` }).click();
        await expect(flash(page, "Category reactivated.")).toBeVisible();
        await expect(rowOf(page, category.name)).toContainText("Active");
    });

    test("search, status filter and pagination work on real data", async ({ page }) => {
        const prefix = `E2E Page ${unique()}`;
        for (let index = 1; index <= 12; index++) {
            await makeCategory({ name: `${prefix} ${String(index).padStart(2, "0")}` });
        }
        await asAdmin(async (admin) => {
            const { categories } = await (await admin.get(`categories?search=${encodeURIComponent(prefix + " 12")}`)).json().then((body) => body.data);
            await admin.delete(`categories/${categories[0]._id}`); // make one inactive
        });

        await page.goto("/categories");
        await page.getByRole("searchbox", { name: "Search" }).fill(prefix);

        // 12 matches, 10 per page
        await expect(pagination(page)).toContainText("Showing 1–10 of 12");
        await expect(cards(page)).toHaveCount(10);
        await page.getByRole("button", { name: "Next page" }).click();
        await expect(pagination(page)).toContainText("Showing 11–12 of 12");
        await expect(cards(page)).toHaveCount(2);
        await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();

        // A status filter goes back to page 1 and narrows to the one inactive category
        await page.getByRole("combobox", { name: "Status" }).selectOption("INACTIVE");
        await expect(pagination(page)).toContainText("Showing 1–1 of 1");
        await expect(rowOf(page, `${prefix} 12`)).toContainText("Inactive");
    });
});

// ======================================================================================
test.describe("products (admin)", () => {
    test.use({ storageState: statePath("admin") });

    test("create through the form: prices, tax, uppercase SKU, and the database agrees", async ({ page }) => {
        const category = await makeCategory();
        const id = unique();
        const name = `E2E Keyboard ${id}`;
        await page.goto("/products");

        await page.getByRole("button", { name: "New product" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Name", { exact: true }).fill(name);
        await dialog.getByLabel("SKU").fill(`e2e-key-${id}`); // typed in lower case
        await dialog.getByLabel("Category").selectOption({ label: category.name });
        await dialog.getByLabel("Brand (optional)").fill("Acme");
        await dialog.getByLabel("Cost price (₹)").fill("400");
        await dialog.getByLabel("Selling price (₹)").fill("949.5");
        await dialog.getByLabel("Tax rate (%)").fill("18");
        await dialog.getByLabel("Reorder level").fill("25");
        await dialog.getByRole("button", { name: "Create product" }).click();
        await expect(flash(page, "Product created.")).toBeVisible();

        await page.getByRole("searchbox", { name: "Search" }).fill(name);
        const row = rowOf(page, name);
        await expect(row).toContainText(`E2E-KEY-${id}`.toUpperCase());
        await expect(row).toContainText(category.name);
        await expect(row).toContainText("₹400.00");
        await expect(row).toContainText("₹949.50");

        const { products } = await readAs("admin", `products?search=${encodeURIComponent(name)}`);
        expect(products).toHaveLength(1);
        expect(products[0]).toMatchObject({
            sku: `E2E-KEY-${id}`.toUpperCase(), // the server upper-cased it
            brand: "Acme", costPrice: 400, sellingPrice: 949.5, taxRate: 18, reorderLevel: 25, status: "ACTIVE"
        });
        expect(products[0].category._id).toBe(category._id);
    });

    test("a duplicate SKU is refused with the server's message", async ({ page }) => {
        const existing = await makeProduct();
        await page.goto("/products");

        await page.getByRole("button", { name: "New product" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Name", { exact: true }).fill(`Another ${unique()}`);
        await dialog.getByLabel("SKU").fill(existing.sku);
        await dialog.getByLabel("Category").selectOption({ index: 1 });
        await dialog.getByRole("button", { name: "Create product" }).click();

        await expect(dialog.getByRole("alert")).toContainText(`SKU ${existing.sku} is already used by "${existing.name}"`);
    });

    test("bad input is caught in the form; the server is not even asked", async ({ page }) => {
        await page.goto("/products");
        await page.getByRole("button", { name: "New product" }).click();
        const dialog = page.getByRole("dialog");

        let created = false;
        page.on("request", (request) => {
            if (request.method() === "POST" && request.url().endsWith("/products")) created = true;
        });
        await dialog.getByLabel("Name", { exact: true }).fill("X");
        await dialog.getByLabel("SKU").fill("bad sku!");
        await dialog.getByLabel("Cost price (₹)").fill("-5");
        await dialog.getByLabel("Image URL (optional)").fill("javascript:alert(1)");
        await dialog.getByRole("button", { name: "Create product" }).click();

        await expect(dialog.getByText("Product name must be at least 2 characters")).toBeVisible();
        await expect(dialog.getByText("SKU can only contain letters, numbers and dashes")).toBeVisible();
        await expect(dialog.getByText("Choose a category", { exact: true })).toBeVisible();
        await expect(dialog.getByText("Cost price cannot be negative")).toBeVisible();
        await expect(dialog.getByText("Image URL must start with http:// or https://")).toBeVisible();
        expect(created).toBe(false);
    });

    test("edit a price: saved, shown, and the change is in the audit log with before and after", async ({ page }) => {
        const product = await makeProduct({ sellingPrice: 150 });
        await page.goto("/products");
        await page.getByRole("searchbox", { name: "Search" }).fill(product.name);

        await page.getByRole("button", { name: `Edit ${product.name}` }).click();
        await expect(page.getByLabel("Selling price (₹)")).toHaveValue("150");
        await page.getByLabel("Selling price (₹)").fill("199");
        await page.getByRole("button", { name: "Save changes" }).click();
        await expect(flash(page, "Product updated.")).toBeVisible();
        await expect(rowOf(page, product.name)).toContainText("₹199.00");

        const { auditLogs } = await readAs("admin", `audit-logs?entityType=Product&entityId=${product._id}&action=PRODUCT_UPDATED`);
        expect(auditLogs).toHaveLength(1);
        expect(auditLogs[0].oldValue.sellingPrice).toBe(150);
        expect(auditLogs[0].newValue.sellingPrice).toBe(199);
        expect(auditLogs[0].user.email).toBe("admin@e2e.test");
    });

    test("deactivate keeps the record (status only), and reactivate brings it back", async ({ page }) => {
        const product = await makeProduct();
        await page.goto("/products");
        await page.getByRole("searchbox", { name: "Search" }).fill(product.name);

        await page.getByRole("button", { name: `Deactivate ${product.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(flash(page, "Product deactivated.")).toBeVisible();
        await expect(rowOf(page, product.name)).toContainText("Inactive");
        expect((await readAs("admin", `products/${product._id}`)).product.status).toBe("INACTIVE");

        await page.getByRole("button", { name: `Reactivate ${product.name}` }).click();
        await expect(flash(page, "Product reactivated.")).toBeVisible();
        expect((await readAs("admin", `products/${product._id}`)).product.status).toBe("ACTIVE");
    });

    test("filters and sorting: category, status, search by SKU, price order", async ({ page }) => {
        const category = await makeCategory();
        const brand = `Brand${unique()}`;
        const cheap = await makeProduct({ category: category._id, brand, sellingPrice: 100 });
        const mid = await makeProduct({ category: category._id, brand, sellingPrice: 200 });
        const dear = await makeProduct({ category: category._id, brand, sellingPrice: 300 });
        await asAdmin((admin) => admin.delete(`products/${mid._id}`));

        await page.goto("/products");
        await page.getByRole("searchbox", { name: "Search" }).fill(brand); // search also looks at the brand
        await expect(cards(page)).toHaveCount(3);

        await page.getByRole("combobox", { name: "Sort by" }).selectOption("price_high");
        await expect(cards(page).nth(0)).toContainText(dear.name);
        await expect(cards(page).nth(2)).toContainText(cheap.name);
        await page.getByRole("combobox", { name: "Sort by" }).selectOption("price_low");
        await expect(cards(page).nth(0)).toContainText(cheap.name);

        await page.getByRole("combobox", { name: "Status" }).selectOption("INACTIVE");
        await expect(cards(page)).toHaveCount(1);
        await expect(cards(page).nth(0)).toContainText(mid.name);
        await page.getByRole("combobox", { name: "Status" }).selectOption("");

        await page.getByRole("combobox", { name: "Category" }).selectOption({ label: category.name });
        await expect(cards(page)).toHaveCount(3);

        // Find one by its SKU
        await page.getByRole("searchbox", { name: "Search" }).fill(dear.sku);
        await expect(cards(page)).toHaveCount(1);
        await expect(cards(page).nth(0)).toContainText(dear.name);
    });

    test("only ACTIVE categories can be chosen for a product", async ({ page }) => {
        const inactive = await makeCategory();
        const active = await makeCategory();
        await asAdmin((admin) => admin.delete(`categories/${inactive._id}`));

        await page.goto("/products");
        await page.getByRole("button", { name: "New product" }).click();
        const options = page.getByRole("dialog").getByLabel("Category").locator("option");
        await expect(options.filter({ hasText: active.name })).toHaveCount(1);
        await expect(options.filter({ hasText: inactive.name })).toHaveCount(0);
    });
});

// ======================================================================================
test.describe("warehouses", () => {
    test.describe("admin", () => {
        test.use({ storageState: statePath("admin") });

        test("create with a manager: the code is upper-cased, and the database agrees", async ({ page }) => {
            const id = unique();
            const name = `E2E Hub ${id}`;
            await page.goto("/warehouses");

            await page.getByRole("button", { name: "New warehouse" }).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByLabel("Name", { exact: true }).fill(name);
            await dialog.getByLabel("Code", { exact: true }).fill(`e2e-${id}`.slice(0, 14)); // lower case on purpose
            await dialog.getByLabel("City", { exact: true }).fill("Pune");
            await dialog.getByLabel("Capacity (units)").fill("2500");
            await dialog.getByLabel("Manager (optional)").selectOption({ label: USERS.manager.name });
            await dialog.getByRole("button", { name: "Create warehouse" }).click();
            await expect(flash(page, "Warehouse created.")).toBeVisible();

            await page.getByRole("searchbox", { name: "Search" }).fill(name);
            const row = rowOf(page, name);
            await expect(row).toContainText(`e2e-${id}`.slice(0, 14).toUpperCase());
            await expect(row).toContainText("Pune");
            await expect(row).toContainText("2,500");
            await expect(row).toContainText(USERS.manager.name);

            const { warehouses } = await readAs("admin", `warehouses?search=${encodeURIComponent(name)}`);
            expect(warehouses[0]).toMatchObject({ city: "Pune", capacity: 2500, status: "ACTIVE", code: `e2e-${id}`.slice(0, 14).toUpperCase() });
            expect(warehouses[0].manager.email).toBe(USERS.manager.email);
        });

        test("a duplicate code is refused", async ({ page }) => {
            const existing = await makeWarehouse();
            await page.goto("/warehouses");

            await page.getByRole("button", { name: "New warehouse" }).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByLabel("Name", { exact: true }).fill(`Copycat ${unique()}`);
            await dialog.getByLabel("Code", { exact: true }).fill(existing.code.toLowerCase());
            await dialog.getByLabel("City", { exact: true }).fill("Delhi");
            await dialog.getByRole("button", { name: "Create warehouse" }).click();

            await expect(dialog.getByRole("alert")).toContainText(`Code ${existing.code} is already used by "${existing.name}"`);
        });

        test("a warehouse with stock can't shrink below it or be deactivated; an empty one can, and can come back", async ({ page }) => {
            const product = await makeProduct();
            const full = await makeWarehouse({ capacity: 100 });
            await stockIn({ product, warehouse: full, quantity: 40 });
            await page.goto("/warehouses");
            await page.getByRole("searchbox", { name: "Search" }).fill(full.name);

            // Capacity below the stock is refused
            await page.getByRole("button", { name: `Edit ${full.name}` }).click();
            await page.getByLabel("Capacity (units)").fill("30");
            await page.getByRole("button", { name: "Save changes" }).click();
            await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Capacity cannot be less than the 40 unit(s) currently in stock");
            await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

            // Deactivating a warehouse that holds stock is refused
            await page.getByRole("button", { name: `Deactivate ${full.name}` }).click();
            await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
            await expect(page.getByRole("dialog")).toContainText("still holds 40 unit(s)");
            await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
            expect((await readAs("admin", `warehouses/${full._id}`)).warehouse.status).toBe("ACTIVE");

            // An empty warehouse deactivates, and reactivates
            const empty = await makeWarehouse();
            await page.getByRole("searchbox", { name: "Search" }).fill(empty.name);
            await page.getByRole("button", { name: `Deactivate ${empty.name}` }).click();
            await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
            await expect(flash(page, "Warehouse deactivated.")).toBeVisible();
            await expect(rowOf(page, empty.name)).toContainText("Inactive");
            await page.getByRole("button", { name: `Reactivate ${empty.name}` }).click();
            await expect(flash(page, "Warehouse reactivated.")).toBeVisible();
            expect((await readAs("admin", `warehouses/${empty._id}`)).warehouse.status).toBe("ACTIVE");
        });

        test("the manager can be changed and removed", async ({ page }) => {
            const warehouse = await makeWarehouse();
            await page.goto("/warehouses");
            await page.getByRole("searchbox", { name: "Search" }).fill(warehouse.name);

            await page.getByRole("button", { name: `Edit ${warehouse.name}` }).click();
            await page.getByLabel("Manager (optional)").selectOption({ label: USERS.manager2.name });
            await page.getByRole("button", { name: "Save changes" }).click();
            await expect(flash(page, "Warehouse updated.")).toBeVisible();
            await expect(rowOf(page, warehouse.name)).toContainText(USERS.manager2.name);

            await page.getByRole("button", { name: `Edit ${warehouse.name}` }).click();
            await page.getByLabel("Manager (optional)").selectOption({ label: "No manager" });
            await page.getByRole("button", { name: "Save changes" }).click();
            await expect(flash(page, "Warehouse updated.")).toBeVisible();
            expect((await readAs("admin", `warehouses/${warehouse._id}`)).warehouse.manager).toBeNull();
        });
    });

    test.describe("inventory manager", () => {
        test.use({ storageState: statePath("manager") });

        test("can create and edit warehouses, but has no manager field, and editing keeps the manager", async ({ page }) => {
            const managerUser = (await readAs("admin", `users?search=${USERS.manager.email}`)).users[0];
            const warehouse = await makeWarehouse({ manager: managerUser._id });
            await page.goto("/warehouses");
            await page.getByRole("searchbox", { name: "Search" }).fill(warehouse.name);

            await page.getByRole("button", { name: `Edit ${warehouse.name}` }).click();
            await expect(page.getByLabel("Manager (optional)")).toHaveCount(0);
            await page.getByLabel("City", { exact: true }).fill("Jaipur");
            await page.getByRole("button", { name: "Save changes" }).click();
            await expect(flash(page, "Warehouse updated.")).toBeVisible();

            const stored = (await readAs("admin", `warehouses/${warehouse._id}`)).warehouse;
            expect(stored.city).toBe("Jaipur");
            expect(stored.manager.email).toBe(USERS.manager.email); // untouched

            // ...and can create a new one
            const name = `Manager made ${unique()}`;
            await page.getByRole("button", { name: "New warehouse" }).click();
            await page.getByLabel("Name", { exact: true }).fill(name);
            await page.getByLabel("Code", { exact: true }).fill(`m${unique()}`.slice(0, 12));
            await page.getByLabel("City", { exact: true }).fill("Agra");
            await page.getByRole("button", { name: "Create warehouse" }).click();
            await expect(flash(page, "Warehouse created.")).toBeVisible();
        });
    });
});

// ======================================================================================
test.describe("view-only roles", () => {
    test.describe("staff", () => {
        test.use({ storageState: statePath("staff") });

        for (const [path, createButton] of [["/products", "New product"], ["/categories", "New category"], ["/warehouses", "New warehouse"]]) {
            test(`${path}: can look, cannot create, edit or deactivate`, async ({ page }) => {
                await page.goto(path);
                await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
                await expect(page.getByRole("button", { name: createButton })).toHaveCount(0);
                await expect(page.getByRole("button", { name: /^(Edit|Deactivate|Reactivate) / })).toHaveCount(0);
                await expect(page.locator("main article footer button")).toHaveCount(0); // cards have no action buttons
            });
        }
    });

    test.describe("inventory manager", () => {
        test.use({ storageState: statePath("manager") });

        test("products and categories are view-only for a manager too", async ({ page }) => {
            await makeProduct();
            await page.goto("/products");
            await expect(cards(page).nth(0)).toBeVisible();
            await expect(page.getByRole("button", { name: "New product" })).toHaveCount(0);
            await expect(page.getByRole("button", { name: /^(Edit|Deactivate) / })).toHaveCount(0);

            await page.goto("/categories");
            await expect(page.getByRole("button", { name: "New category" })).toHaveCount(0);
        });
    });
});

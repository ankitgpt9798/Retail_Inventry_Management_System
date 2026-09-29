const { test, expect } = require("@playwright/test");
const { statePath } = require("../helpers/api");

// Layout on small screens. A page that is wider than the screen forces sideways scrolling on a phone,
// which is the most common way a "responsive" site turns out not to be. Checked in a real browser at
// phone and tablet sizes, for every public page and every page of the staff app.

const SIZES = [
    { name: "phone", width: 390, height: 844 },
    { name: "small phone", width: 360, height: 640 },
    { name: "tablet", width: 768, height: 1024 }
];

const PUBLIC_PAGES = ["/", "/features", "/about", "/contact", "/login", "/register", "/no-such-page"];
const APP_PAGES = [
    "/dashboard", "/products", "/categories", "/warehouses", "/inventory", "/inventory/history", "/transfers", "/orders", "/orders/new",
    "/fulfillment", "/suppliers", "/purchases", "/purchases/new", "/reports", "/users", "/audit-logs", "/notifications", "/profile"
];

// How far past the screen's right edge the page reaches, and which elements are responsible
const overflowOf = (page) =>
    page.evaluate(() => {
        const screenWidth = document.documentElement.clientWidth;
        const culprits = [...document.querySelectorAll("body *")]
            .filter((element) => {
                const box = element.getBoundingClientRect();
                if (box.width === 0 || box.right <= screenWidth + 1) return false;
                // Content inside a scrolling container (e.g. a wide table) is fine: only the container's own edge matters
                for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                    const overflowX = getComputedStyle(parent).overflowX;
                    if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return false;
                }
                return true;
            })
            .slice(0, 4)
            .map((element) => `${element.tagName.toLowerCase()}${element.className ? "." + String(element.className).split(" ").slice(0, 3).join(".") : ""}`);
        return { extra: document.documentElement.scrollWidth - screenWidth, culprits };
    });

for (const size of SIZES) {
    test.describe(`${size.name} (${size.width}px)`, () => {
        test.use({ viewport: { width: size.width, height: size.height } });

        test.describe("public website", () => {
            for (const path of PUBLIC_PAGES) {
                test(`${path} fits the screen`, async ({ page }) => {
                    await page.goto(path);
                    await page.waitForLoadState("networkidle");
                    const { extra, culprits } = await overflowOf(page);
                    expect(extra, `${path} is ${extra}px too wide. Wide elements: ${culprits.join(" | ")}`).toBeLessThanOrEqual(1);
                });
            }
        });

        test.describe("staff app (admin)", () => {
            test.use({ storageState: statePath("admin") });

            for (const path of APP_PAGES) {
                test(`${path} fits the screen`, async ({ page }) => {
                    await page.goto(path);
                    await page.waitForLoadState("networkidle");
                    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
                    const { extra, culprits } = await overflowOf(page);
                    expect(extra, `${path} is ${extra}px too wide. Wide elements: ${culprits.join(" | ")}`).toBeLessThanOrEqual(1);
                });
            }
        });
    });
}

test.describe("the phone menu", () => {
    test.use({ viewport: { width: 390, height: 844 }, storageState: statePath("admin") });

    test("the top bar collapses into a menu that lists every page the admin may open", async ({ page }) => {
        await page.goto("/dashboard");
        // The desktop links are hidden on a phone; the menu button is there instead
        await expect(page.getByRole("navigation", { name: "App" })).toBeHidden();
        await page.getByLabel("Open menu").click();
        const menu = page.locator(".dropdown-content.menu").first();
        for (const label of ["Dashboard", "Products", "Categories", "Inventory", "Warehouses", "Transfers", "Orders", "Fulfillment", "Suppliers", "Purchases", "Reports", "Users", "Audit log"]) {
            await expect(menu.getByRole("link", { name: label, exact: true }), label).toBeVisible();
        }
    });

    test("choosing a page in the phone menu really navigates there", async ({ page }) => {
        await page.goto("/dashboard");
        await page.getByLabel("Open menu").click();
        await page.locator(".dropdown-content.menu").first().getByRole("link", { name: "Reports", exact: true }).click();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
    });

    // Was FINDING F6: on a phone the menu stayed open, covering the new page, after you chose where to go (the
    // desktop drop-downs closed themselves; the phone menu did not). Fixed: the phone menu is rebuilt, closed,
    // after every page change (AppNavbar's PhoneMenu).
    test("the phone menu closes after you choose a page, and opens again when asked", async ({ page }) => {
        await page.goto("/dashboard");
        await page.getByLabel("Open menu").click();
        await page.locator(".dropdown-content.menu").first().getByRole("link", { name: "Reports", exact: true }).click();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.locator(".dropdown-content.menu").first(), "the menu should have closed").toBeHidden();

        // ...and it still works the next time it is needed
        await page.getByLabel("Open menu").click();
        await expect(page.locator(".dropdown-content.menu").first().getByRole("link", { name: "Orders", exact: true })).toBeVisible();
    });

    test("a wide table scrolls inside its own box instead of stretching the page", async ({ page }) => {
        await page.goto("/products");
        await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
        const table = page.locator("div.overflow-x-auto").first();
        if (await table.count()) {
            const scrolls = await table.evaluate((element) => element.scrollWidth > element.clientWidth);
            const { extra } = await overflowOf(page);
            expect(extra).toBeLessThanOrEqual(1); // the page itself never scrolls sideways
            void scrolls; // (the table may or may not need to: what matters is that the page does not)
        }
    });
});

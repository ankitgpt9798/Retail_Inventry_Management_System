const { test, expect } = require("@playwright/test");
const { statePath } = require("../helpers/api");

// Layout on small screens. A page that is wider than the screen forces sideways scrolling on a phone,
// which is the most common way a "responsive" site turns out not to be. Checked in a real browser at
// phone and tablet sizes, for every public page and every page of the staff app.

const SIZES = [
    { name: "phone", width: 390, height: 844 },
    { name: "small phone", width: 360, height: 640 },
    { name: "large phone", width: 480, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "small laptop", width: 1024, height: 768 }
];

// (Features and About are sections of the home page now, not pages of their own)
const PUBLIC_PAGES = ["/", "/contact", "/login", "/register", "/no-such-page"];
const APP_PAGES = [
    "/dashboard", "/products", "/categories", "/warehouses", "/inventory", "/inventory/history", "/transfers", "/orders", "/orders/new",
    "/fulfillment", "/customers", "/suppliers", "/purchases", "/purchases/new", "/reports", "/users", "/audit-logs", "/notifications", "/profile"
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

    const drawer = (page) => page.getByRole("dialog", { name: "Menu" });

    test("the sidebar collapses into a menu that lists every page the admin may open", async ({ page }) => {
        await page.goto("/dashboard");
        // The sidebar is hidden on a phone; the menu button is there instead
        await expect(page.getByRole("navigation", { name: "App" })).toBeHidden();
        await page.getByLabel("Open menu").click();
        for (const label of [
            "Dashboard", "Products", "Categories", "Inventory", "Stock history", "Warehouses", "Transfers", "Orders", "Fulfillment",
            "Customers", "Suppliers", "Purchases", "Reports", "Users", "Audit log"
        ]) {
            await expect(drawer(page).getByRole("link", { name: label, exact: true }), label).toBeVisible();
        }
    });

    test("choosing a page in the phone menu really navigates there", async ({ page }) => {
        await page.goto("/dashboard");
        await page.getByLabel("Open menu").click();
        await drawer(page).getByRole("link", { name: "Reports", exact: true }).click();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
    });

    // Was FINDING F6: on a phone the menu stayed open, covering the new page, after you chose where to go.
    // The menu is now a drawer that closes after every page change (and with Escape or a tap outside it).
    test("the phone menu closes after you choose a page, and opens again when asked", async ({ page }) => {
        await page.goto("/dashboard");
        await page.getByLabel("Open menu").click();
        await drawer(page).getByRole("link", { name: "Reports", exact: true }).click();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(drawer(page), "the menu should have closed").toBeHidden();

        // ...and it still works the next time it is needed
        await page.getByLabel("Open menu").click();
        await expect(drawer(page).getByRole("link", { name: "Orders", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer(page)).toBeHidden();
    });

    test("list pages show one card per row, and a wide report table scrolls inside its own box", async ({ page }) => {
        await page.goto("/products");
        await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
        const boxes = await page.locator("main article").evaluateAll((cards) => cards.slice(0, 2).map((card) => card.getBoundingClientRect()));
        if (boxes.length === 2) expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom - 1); // stacked, not side by side

        await page.goto("/reports");
        await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const { extra } = await overflowOf(page);
        expect(extra).toBeLessThanOrEqual(1); // the page itself never scrolls sideways
    });
});

const { test, expect } = require("@playwright/test");
const { statePath } = require("../helpers/api");
const flows = require("../helpers/flows");
const { readAs } = require("../helpers/data");
const { unique } = require("../helpers/ui");

// Phase 7: reports, the dashboard and its charts. A KNOWN dataset is built through the real API in one warehouse,
// and every number is worked out BY HAND below from the documented definitions (ARCHITECTURE.md → Reports).
// The reports (API) and the screens (UI) must both agree with the hand calculation, and with each other.
//
//   Warehouse W (capacity 1,000)            Product A: cost ₹100, price ₹1,000 + 18% tax    Product B: cost ₹50, price ₹500, no tax
//   1. Stock in            A 100, B 40                                   →  A 100, B 40
//   2. Stock out (manual)  A 10                                          →  A 90
//   3. PO1  A ×20 @₹100 = ₹2,000, fully received                         →  A 110
//      PO2  B ×10 @₹45  = ₹450, ordered, 4 received (6 still due)        →  B 44
//      PO3  B ×1 draft  = ₹50                                            (not sent: counts nowhere)
//   4. O1   A×2 + B×3, delivered  (₹2,360 + ₹1,500 = ₹3,860)              →  A 108, B 41
//      O2   A×1 confirmed (₹1,180, stock reserved)                        →  A reserved 1
//      O3   B×2 confirmed then cancelled (₹1,000)
//      O4   A×1 pending (₹1,180)
//   5. Reorder level of B set to 45 (B has 41 available → 4 short)

test.describe.configure({ mode: "serial" });

let W; // the scene
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
// A summary tile (not a table heading with the same words)
// A number tile (StatCard): the card whose label is exactly this text
const tile = (page, label) => page.locator('div[class~="@container"]').filter({ has: page.getByText(label, { exact: true }) });
const rowOf = (page, text) => page.getByRole("row").filter({ hasText: text });

test.beforeAll(async () => {
    test.setTimeout(180_000);
    const id = unique();
    const supplier = await flows.supplier();
    const warehouse = await flows.makeWarehouse({ name: `00 Report Hub ${id}`, capacity: 1000 }); // sorts first in the drop-downs
    const A = await flows.makeProduct({ name: `Rpt Laptop ${id}`, costPrice: 100, sellingPrice: 1000, taxRate: 18, reorderLevel: 10 });
    const B = await flows.makeProduct({ name: `Rpt Mouse ${id}`, costPrice: 50, sellingPrice: 500, taxRate: 0, reorderLevel: 10 });

    await flows.stockIn({ product: A, warehouse, quantity: 100 });
    await flows.stockIn({ product: B, warehouse, quantity: 40 });
    await flows.stockOut(A, warehouse, 10);
    await flows.purchase({ supplier, warehouse }, [[A, 20, 100]], { receive: [[A, 20]] }); // PO1
    await flows.purchase({ supplier, warehouse }, [[B, 10, 45]], { receive: [[B, 4]] }); // PO2
    await flows.purchase({ supplier, warehouse }, [[B, 1]], { until: "draft" }); // PO3
    await flows.order({ warehouse }, [[A, 2], [B, 3]], "delivered"); // O1
    await flows.order({ warehouse }, [[A, 1]], "confirmed"); // O2
    await flows.order({ warehouse }, [[B, 2]], "cancelled"); // O3
    await flows.order({ warehouse }, [[A, 1]], "pending"); // O4
    await flows.setReorderLevel(B, warehouse, 45);

    W = { supplier, warehouse, A, B };
});

// ======================================================================================
test.describe("every report: the API and the screen agree with the hand calculation", () => {
    test.use({ storageState: statePath("manager") });

    const openReport = async (page, tab, warehouse = W.warehouse.name) => {
        await page.goto("/reports");
        if (tab !== "Inventory") await page.getByRole("tab", { name: tab, exact: true }).click();
        if (warehouse) await page.getByRole("combobox", { name: "Warehouse" }).selectOption({ label: warehouse });
    };

    test("inventory: quantities, reserved stock and value at cost", async ({ page }) => {
        // API
        const { summary, rows } = await readAs("manager", `reports/inventory?warehouse=${W.warehouse._id}`);
        expect(summary).toMatchObject({ productCount: 2, totalQuantity: 149, totalReserved: 1, totalAvailable: 148, totalStockValue: 12850 });
        const a = rows.find((row) => row.sku === W.A.sku);
        const b = rows.find((row) => row.sku === W.B.sku);
        expect(a).toMatchObject({ quantity: 108, reservedQuantity: 1, availableQuantity: 107, costPrice: 100, stockValue: 10800 });
        expect(b).toMatchObject({ quantity: 41, reservedQuantity: 0, availableQuantity: 41, costPrice: 50, stockValue: 2050 });
        expect(rows[0].sku).toBe(W.A.sku); // most valuable first

        // Screen
        await openReport(page, "Inventory");
        await expect(tile(page, "Units on hand")).toContainText("149");
        await expect(tile(page, "Reserved")).toContainText("1");
        await expect(tile(page, "Available")).toContainText("148");
        await expect(tile(page, "Stock value")).toContainText(money(12850));
        await expect(rowOf(page, W.A.sku)).toContainText("108");
        await expect(rowOf(page, W.A.sku)).toContainText(money(10800));
        await expect(rowOf(page, W.B.sku)).toContainText(money(2050));
        await expect(page.getByRole("row")).toHaveCount(3); // header + 2 products (the filter really narrowed it)
    });

    test("warehouses: capacity used and value", async ({ page }) => {
        const { rows } = await readAs("manager", "reports/warehouses");
        const row = rows.find((r) => r.code === W.warehouse.code);
        expect(row).toMatchObject({ capacity: 1000, totalQuantity: 149, availableQuantity: 148, productCount: 2, stockValue: 12850 });
        expect(row.utilizationPercent).toBeCloseTo(14.9, 5);

        await page.goto("/reports");
        await page.getByRole("tab", { name: "Warehouses" }).click();
        await expect(rowOf(page, W.warehouse.code)).toContainText("14.9%");
        await expect(rowOf(page, W.warehouse.code)).toContainText(money(12850));
    });

    test("stock movement: every kind of movement counted, and the chart shows in and out", async ({ page }) => {
        const { totals } = await readAs("manager", `reports/stock-movement?warehouse=${W.warehouse._id}`);
        // in: 100 + 40 stocked, 20 + 4 received from suppliers. out: 10 by hand, 2 + 3 shipped
        expect(totals.STOCK_IN).toEqual({ quantity: 164, count: 4 });
        expect(totals.STOCK_OUT).toEqual({ quantity: 15, count: 3 });
        expect(totals.TRANSFER_IN).toEqual({ quantity: 0, count: 0 });
        expect(totals.TRANSFER_OUT).toEqual({ quantity: 0, count: 0 });
        expect(totals.ADJUSTMENT).toEqual({ quantity: 0, count: 0 });

        await openReport(page, "Stock movement");
        await expect(tile(page, "Stock in (units)")).toContainText("164");
        await expect(tile(page, "Stock out (units)")).toContainText("15");
        await expect(rowOf(page, "Stock in")).toContainText("4"); // 4 movements
        // The chart: this month's two lines carry those totals (both fell in this one month)
        const month = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date());
        await expect(page.getByRole("img", { name: `${month}: Stock in 164, Stock out 15` })).toBeVisible();
    });

    test("orders: status counts, sales, revenue and the average order", async ({ page }) => {
        const { summary, byStatus } = await readAs("manager", `reports/orders?warehouse=${W.warehouse._id}`);
        expect(summary).toMatchObject({ totalOrders: 4, salesOrders: 2, cancelledOrders: 1, completedOrders: 1, revenue: 5040, averageOrderValue: 2520 });
        const by = Object.fromEntries(byStatus.map((row) => [row.status, row]));
        expect(by.PENDING).toMatchObject({ count: 1, totalAmount: 1180 });
        expect(by.CONFIRMED).toMatchObject({ count: 1, totalAmount: 1180 });
        expect(by.DELIVERED).toMatchObject({ count: 1, totalAmount: 3860 });
        expect(by.CANCELLED).toMatchObject({ count: 1, totalAmount: 1000 });

        await openReport(page, "Orders");
        await expect(tile(page, "All orders")).toContainText("4");
        await expect(tile(page, "Sales orders")).toContainText("2");
        await expect(tile(page, "Revenue")).toContainText(money(5040));
        await expect(tile(page, "Average order")).toContainText(money(2520));
        await expect(page.getByRole("cell", { name: "Delivered" }).locator("..")).toContainText(money(3860));
    });

    test("purchases: ordered value counts only sent orders; received value is what really arrived", async ({ page }) => {
        const { summary, byStatus } = await readAs("manager", `reports/purchases?supplier=${W.supplier._id}`);
        expect(summary).toMatchObject({ totalPurchaseOrders: 3, openPurchaseOrders: 1, orderedValue: 2450, receivedValue: 2180 });
        const by = Object.fromEntries(byStatus.map((row) => [row.status, row]));
        expect(by.DRAFT).toMatchObject({ count: 1, totalAmount: 50 });
        expect(by.PARTIALLY_RECEIVED).toMatchObject({ count: 1, totalAmount: 450 });
        expect(by.RECEIVED).toMatchObject({ count: 1, totalAmount: 2000 });

        await page.goto("/reports");
        await page.getByRole("tab", { name: "Purchases", exact: true }).click();
        await page.getByRole("combobox", { name: "Supplier" }).selectOption({ label: W.supplier.name });
        await expect(tile(page, "Purchase orders")).toContainText("3");
        await expect(tile(page, "Still open")).toContainText("1");
        await expect(tile(page, "Ordered value")).toContainText(money(2450));
        await expect(tile(page, "Received value")).toContainText(money(2180));
    });

    test("suppliers: delivery reliability", async ({ page }) => {
        const { rows } = await readAs("manager", "reports/suppliers");
        const row = rows.find((r) => r.supplierId === W.supplier._id);
        expect(row).toMatchObject({ purchaseOrders: 2, unitsOrdered: 30, unitsReceived: 24, orderedValue: 2450, receivedValue: 2180, fulfilmentRatePercent: 80, openPurchaseOrders: 1 });

        await page.goto("/reports");
        await page.getByRole("tab", { name: "Suppliers", exact: true }).click();
        await expect(rowOf(page, W.supplier.name)).toContainText("80%");
        await expect(rowOf(page, W.supplier.name)).toContainText(money(2180));
    });

    test("low stock: what is short, by how much, and what is already on order", async ({ page }) => {
        const { summary, rows } = await readAs("manager", `reports/low-stock?warehouse=${W.warehouse._id}`);
        expect(summary).toEqual({ itemCount: 1, totalShortage: 4 });
        expect(rows[0]).toMatchObject({ availableQuantity: 41, reorderLevel: 45, shortage: 4, onOrderQuantity: 6 }); // 6 still due on PO2 (the draft PO3 doesn't count)
        expect(rows[0].product.sku).toBe(W.B.sku);

        await openReport(page, "Low stock");
        await expect(tile(page, "Items low on stock")).toContainText("1");
        await expect(tile(page, "Total shortage (units)")).toContainText("4");
        const row = rowOf(page, W.B.sku);
        await expect(row).toContainText("41");
        await expect(row).toContainText("45");
        await expect(row.getByRole("cell").nth(4)).toHaveText("4");
        await expect(row.getByRole("cell").nth(5)).toHaveText("6");
    });

    test("best sellers: only shipped or delivered goods count, ranked by units or by revenue", async ({ page }) => {
        const units = await readAs("manager", `reports/product-performance?warehouse=${W.warehouse._id}&sortBy=units`);
        expect(units.rows.map((row) => [row.sku, row.unitsSold, row.revenue])).toEqual([[W.B.sku, 3, 1500], [W.A.sku, 2, 2360]]);
        const revenue = await readAs("manager", `reports/product-performance?warehouse=${W.warehouse._id}&sortBy=revenue`);
        expect(revenue.rows.map((row) => row.sku)).toEqual([W.A.sku, W.B.sku]);

        await openReport(page, "Best sellers");
        await expect(page.getByRole("row").nth(1)).toContainText(W.B.sku); // most units first
        await page.getByRole("combobox", { name: "Rank by" }).selectOption("revenue");
        await expect(page.getByRole("row").nth(1)).toContainText(W.A.sku);
        await expect(rowOf(page, W.A.sku)).toContainText(money(2360));
        // The chart follows the ranking
        await expect(page.getByRole("region", { name: "Top products by revenue (₹)" })).toBeVisible();
    });

    test("a date range that ended long ago finds nothing, and a bad range is refused with the server's message", async ({ page }) => {
        await openReport(page, "Orders");
        await page.getByLabel("From", { exact: true }).fill("2020-01-01");
        await page.getByLabel("To", { exact: true }).fill("2020-01-31");
        await expect(tile(page, "All orders")).toContainText("0");
        await expect(tile(page, "Revenue")).toContainText(money(0));

        const manager = await require("../helpers/api").apiAs("manager");
        const bad = await manager.get("reports/orders?from=2026-09-30&to=2026-09-01");
        expect(bad.status()).toBe(422);
        expect((await bad.json()).message).toContain("from cannot be after to");
        await manager.dispose();
    });
});

// ======================================================================================
test.describe("the dashboard", () => {
    test.use({ storageState: statePath("admin") });

    // Independent recount from the ordinary list endpoints, NOT from the reports code
    const recount = async () => {
        const total = async (url) => (await readAs("admin", `${url}${url.includes("?") ? "&" : "?"}limit=1`)).pagination.total;
        const pages = async (url, key) => {
            const all = [];
            for (let page = 1; ; page++) {
                const data = await readAs("admin", `${url}${url.includes("?") ? "&" : "?"}limit=100&page=${page}`);
                all.push(...data[key]);
                if (page >= data.pagination.totalPages) break;
            }
            return all;
        };
        const orderCount = async (status) => total(`orders?status=${status}`);
        const purchaseCount = async (status) => total(`purchases?status=${status}`);

        const inventories = await pages("inventory", "inventories");
        const lowStock = await pages("inventory/low-stock", "inventories");
        const activeProducts = await pages("products?status=ACTIVE", "products");
        const orders = await pages("orders", "orders");
        const [pending, confirmed, processing, packed, shipped, delivered] = await Promise.all(
            ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].map(orderCount)
        );
        return {
            totalProducts: await total("products?status=ACTIVE"),
            totalCategories: await total("categories?status=ACTIVE"),
            totalWarehouses: await total("warehouses?status=ACTIVE"),
            totalSuppliers: await total("suppliers?status=ACTIVE"),
            totalInventory: inventories.reduce((sum, row) => sum + row.quantity, 0),
            lowStockProducts: new Set(lowStock.map((row) => row.product._id)).size,
            totalOrders: pending + confirmed + processing + packed + shipped + delivered, // everything except cancelled
            pendingOrders: pending + confirmed + processing + packed,
            completedOrders: delivered,
            pendingPurchases: (await Promise.all(["PENDING", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].map(purchaseCount))).reduce((a, b) => a + b, 0),
            // Σ units on hand × the product's cost price
            stockValue: Math.round(inventories.reduce((sum, row) => sum + row.quantity * row.product.costPrice, 0) * 100) / 100,
            // active products with nothing available in any warehouse (never stocked counts too)
            outOfStockProducts: activeProducts.filter((product) =>
                inventories.filter((row) => row.product._id === product._id).reduce((sum, row) => sum + row.availableQuantity, 0) <= 0
            ).length,
            // one customer per email, or per name + phone when there is no email
            totalCustomers: new Set(orders.map((order) => order.customer.email || `${order.customer.name}|${order.customer.phone || ""}`)).size,
            unconfirmedOrders: pending
        };
    };

    test("the headline numbers equal an independent recount, and the screen shows the same", async ({ page }) => {
        const expected = await recount();
        const { kpis } = await readAs("admin", "reports/dashboard");
        expect(kpis).toEqual(expected);

        await page.goto("/dashboard");
        for (const [key, value] of Object.entries(expected)) {
            const shown = key === "stockValue"
                ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value)
                : new Intl.NumberFormat("en-IN").format(value);
            await expect(page.getByTestId(`kpi-${key}`), key).toHaveText(shown);
        }
    });

    test("the six charts: present, drawn in the agreed colours, and their table views match the API", async ({ page }) => {
        const { charts } = await readAs("admin", "reports/dashboard");
        await page.goto("/dashboard");

        for (const title of ["Revenue by month (₹)", "Purchases by month (₹)", "Stock in and out", "Order status", "Stock by warehouse", "Top products"]) {
            await expect(page.getByRole("region", { name: title })).toBeVisible();
        }

        // The colours really resolve in a real browser (CSS variables inside SVG)
        const fills = await page.getByRole("region", { name: "Revenue by month (₹)" }).locator("svg path").evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill));
        expect(fills.some((fill) => fill === "rgb(42, 120, 214)")).toBe(true); // series 1 blue #2a78d6
        const orange = await page.getByRole("region", { name: "Purchases by month (₹)" }).locator("svg path").evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill));
        expect(orange.some((fill) => fill === "rgb(235, 104, 52)")).toBe(true); // series 2 orange #eb6834

        // Table view of the order-status chart = the real number of orders per status
        await page.getByRole("button", { name: "View table: Order status" }).click();
        const statusTable = page.getByRole("region", { name: "Order status" }).getByRole("table");
        for (const { status, count } of charts.orderStatusDistribution) {
            const label = status.charAt(0) + status.slice(1).toLowerCase();
            await expect(statusTable.getByRole("row").filter({ hasText: new RegExp(`^${label}`) })).toContainText(String(count));
        }

        // The warehouse chart lists our warehouse with its stock and capacity used
        await page.getByRole("button", { name: "View table: Stock by warehouse" }).click();
        const warehouseRow = page.getByRole("region", { name: "Stock by warehouse" }).getByRole("row").filter({ hasText: W.warehouse.code });
        await expect(warehouseRow).toContainText("149");
        await expect(warehouseRow).toContainText("14.9%");
    });

    test("this month's revenue bar equals the sum of this month's sales orders, and hovering shows it", async ({ page }) => {
        // Independent: add up the orders that count as sales (confirmed … delivered)
        let revenue = 0;
        let count = 0;
        for (let pageNumber = 1; ; pageNumber++) {
            const data = await readAs("admin", `orders?limit=100&page=${pageNumber}`);
            for (const order of data.orders) {
                if (["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status)) {
                    revenue += order.totalAmount;
                    count += 1;
                }
            }
            if (pageNumber >= data.pagination.totalPages) break;
        }
        expect(count).toBeGreaterThan(0);

        await page.goto("/dashboard");
        // A bar is announced with the full month name, year included, like the line charts (was finding F4)
        const month = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date());
        const bar = page.getByRole("region", { name: "Revenue by month (₹)" }).getByRole("img", { name: `${month}: ${money(revenue)}, ${count} order${count === 1 ? "" : "s"}` });
        await expect(bar).toBeVisible();

        // A real mouse over the bar: the tooltip appears with the same figures, and goes away again
        await bar.hover();
        const tooltip = page.getByRole("tooltip");
        await expect(tooltip).toContainText(money(revenue));
        await expect(tooltip).toContainText(`${count} order`);
        await page.mouse.move(5, 5);
        await expect(tooltip).toHaveCount(0);
    });

    test("staff see the dashboard and its charts; the detailed reports stay closed to them", async ({ browser }) => {
        const context = await browser.newContext({ storageState: statePath("staff") });
        const page = await context.newPage();
        await page.goto("/dashboard");
        await expect(page.getByTestId("kpi-totalProducts")).toBeVisible();
        await expect(page.getByRole("region", { name: "Order status" })).toBeVisible();
        await page.goto("/reports");
        await expect(page.getByText("You don't have access to this page")).toBeVisible();
        await context.close();
    });
});

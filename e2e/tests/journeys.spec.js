const { test, expect } = require("@playwright/test");
const { USERS } = require("../config");
const { apiAs, createVia, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, makeWarehouse, readAs, stockIn } = require("../helpers/data");
const flows = require("../helpers/flows");
const { flash, goToNav, submitLoginForm, unique, cards, cardOf, cardValue } = require("../helpers/ui");

// Phase 8: two long journeys through the WHOLE system. Five different people, each in their own browser,
// doing their part through the real screens. At the end, stock, money, notifications, reports, the dashboard
// and the audit trail must all tell the same story.

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
// Each record is a card on the listing pages
const rowOf = (page, text) => cardOf(page, text);
const kpis = async () => (await readAs("admin", "reports/dashboard")).kpis;
const titlesFor = async (who, text) => {
    const client = typeof who === "string" ? await apiAs(who) : who;
    const body = await (await client.get("notifications?limit=100")).json();
    if (typeof who === "string") await client.dispose();
    return body.data.notifications.filter((note) => note.message.includes(text)).map((note) => note.title);
};

test("Journey 1: from an empty catalog to a delivered sale: set up → buy → receive → sell → ship → deliver", async ({ browser }) => {
    test.setTimeout(240_000);
    const id = unique();
    const names = { category: `J1 Category ${id}`, product: `J1 Speaker ${id}`, sku: `J1-SPK-${id}`.toUpperCase(), warehouse: `J1 Warehouse ${id}`, supplier: `J1 Supplier ${id}` };
    const supplierUser = { name: `J1 Portal ${id}`, email: `j1-portal-${id}@e2e.test`, password: "Journey12345" };
    const before = await kpis();

    const open = async (role) => {
        const context = await browser.newContext({ storageState: statePath(role) });
        return { context, page: await context.newPage() };
    };
    const admin = await open("admin");
    const ravi = await open("manager");
    const neha = await open("manager2");
    const sunita = await open("staff");

    // ============ 1. The admin sets up the business ============
    await admin.page.goto("/categories");
    await admin.page.getByRole("button", { name: "New category" }).click();
    await admin.page.getByRole("dialog").getByLabel("Name").fill(names.category);
    await admin.page.getByRole("dialog").getByRole("button", { name: "Create category" }).click();
    await expect(flash(admin.page, "Category created.")).toBeVisible();

    await admin.page.goto("/products");
    await admin.page.getByRole("button", { name: "New product" }).click();
    let dialog = admin.page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(names.product);
    await dialog.getByLabel("SKU").fill(names.sku);
    await dialog.getByLabel("Category").selectOption({ label: names.category });
    await dialog.getByLabel("Cost price (₹)").fill("200");
    await dialog.getByLabel("Selling price (₹)").fill("500");
    await dialog.getByLabel("Tax rate (%)").fill("12");
    await dialog.getByRole("button", { name: "Create product" }).click();
    await expect(flash(admin.page, "Product created.")).toBeVisible();

    await admin.page.goto("/warehouses");
    await admin.page.getByRole("button", { name: "New warehouse" }).click();
    dialog = admin.page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(names.warehouse);
    await dialog.getByLabel("Code", { exact: true }).fill(`J1${id}`.slice(0, 10));
    await dialog.getByLabel("City", { exact: true }).fill("Nagpur");
    await dialog.getByLabel("Capacity (units)").fill("500");
    await dialog.getByLabel("Manager (optional)").selectOption({ label: USERS.manager.name });
    await dialog.getByRole("button", { name: "Create warehouse" }).click();
    await expect(flash(admin.page, "Warehouse created.")).toBeVisible();

    await admin.page.goto("/suppliers");
    await admin.page.getByRole("button", { name: "New supplier" }).click();
    dialog = admin.page.getByRole("dialog");
    await dialog.getByLabel("Company name").fill(names.supplier);
    await dialog.getByLabel("Email", { exact: true }).fill(`j1-${id}@e2e.test`);
    await dialog.getByRole("button", { name: "Create supplier" }).click();
    await expect(flash(admin.page, "Supplier created.")).toBeVisible();

    await admin.page.goto("/users");
    await admin.page.getByRole("button", { name: "New user" }).click();
    dialog = admin.page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill(supplierUser.name);
    await dialog.getByLabel("Email", { exact: true }).fill(supplierUser.email);
    await dialog.getByLabel("Password").fill(supplierUser.password);
    await dialog.getByLabel("Role").selectOption("SUPPLIER");
    await dialog.getByLabel("Supplier company").selectOption({ label: names.supplier });
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(flash(admin.page, "User created.")).toBeVisible();

    const { products } = await readAs("admin", `products?search=${names.sku}`);
    const product = products[0];
    const warehouse = (await readAs("admin", `warehouses?search=${encodeURIComponent(names.warehouse)}`)).warehouses[0];
    const supplier = (await readAs("admin", `suppliers?search=${encodeURIComponent(names.supplier)}`)).suppliers[0];
    const stock = async () => {
        const { inventories } = await readAs("admin", `inventory?product=${product._id}&warehouse=${warehouse._id}`);
        return inventories[0] || { quantity: 0, reservedQuantity: 0 };
    };

    // ============ 2. Ravi orders 30 speakers ============
    await ravi.page.goto("/purchases/new");
    await ravi.page.getByLabel("Supplier", { exact: true }).selectOption(supplier._id);
    await ravi.page.getByLabel("Deliver to warehouse").selectOption(warehouse._id);
    await ravi.page.getByLabel("Product 1").selectOption(product._id);
    await ravi.page.getByLabel("Quantity 1").fill("30"); // unit cost empty → the product's ₹200
    await ravi.page.getByRole("button", { name: "Save and submit for approval" }).click();
    await expect(ravi.page).toHaveURL(/\/purchases\/[0-9a-f]{24}$/);
    const purchaseId = ravi.page.url().split("/").pop();
    const po = (await readAs("admin", `purchases/${purchaseId}`)).purchase;
    expect(po).toMatchObject({ status: "PENDING", totalAmount: 6000 });

    // ============ 3. Neha approves and sends it ============
    await neha.page.goto(`/purchases/${purchaseId}`);
    await neha.page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(flash(neha.page, `${po.poNumber} approved.`)).toBeVisible();
    await neha.page.getByRole("button", { name: "Mark as ordered" }).click();
    await neha.page.getByRole("dialog").getByRole("button", { name: "Mark as ordered" }).click();
    await expect(flash(neha.page, `${po.poNumber} sent to the supplier.`)).toBeVisible();

    // ============ 4. The supplier logs in for real, sees only this order, confirms it ============
    const supplierContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const sup = await supplierContext.newPage();
    await submitLoginForm(sup, supplierUser);
    await expect(sup).toHaveURL(/\/purchases$/);
    await expect(cards(sup)).toHaveCount(1);
    await sup.getByRole("link", { name: `View ${po.poNumber}` }).click();
    await sup.getByRole("button", { name: "Confirm order" }).click();
    await sup.getByRole("dialog").getByLabel("Delivery note").fill("On its way");
    await sup.getByRole("dialog").getByRole("button", { name: "Confirm order" }).click();
    await expect(flash(sup, `${po.poNumber} confirmed.`)).toBeVisible();

    // ============ 5. The goods arrive: Neha receives all 30 ============
    await neha.page.reload();
    await neha.page.getByRole("button", { name: "Receive goods" }).click();
    await neha.page.getByRole("dialog").getByLabel(`Received quantity for ${names.product}`).fill("30");
    await neha.page.getByRole("dialog").getByRole("button", { name: "Record delivery" }).click();
    await expect(flash(neha.page, `Goods received for ${po.poNumber}.`)).toBeVisible();
    expect((await stock()).quantity).toBe(30);
    expect((await readAs("admin", `purchases/${purchaseId}`)).purchase.status).toBe("RECEIVED");

    // ============ 6. Sunita sells 4 speakers ============
    await sunita.page.goto("/orders/new");
    await sunita.page.getByLabel("Name", { exact: true }).fill("Journey Customer");
    await sunita.page.getByLabel("Warehouse", { exact: true }).selectOption(warehouse._id);
    await sunita.page.getByLabel("Product 1").selectOption(product._id);
    await sunita.page.getByLabel("Quantity 1").fill("4");
    await expect(sunita.page.getByTestId("estimate")).toContainText(money(2240)); // 4 × 500 + 12% tax
    await sunita.page.getByRole("button", { name: "Save and confirm" }).click();
    await expect(sunita.page).toHaveURL(/\/orders\/[0-9a-f]{24}$/);
    const orderId = sunita.page.url().split("/").pop();
    const order = (await readAs("admin", `orders/${orderId}`)).order;
    expect(order).toMatchObject({ status: "CONFIRMED", totalAmount: 2240 });
    expect(await stock()).toMatchObject({ quantity: 30, reservedQuantity: 4 });

    // ============ 7. The warehouse works the queue: process → pack → ship ============
    await sunita.page.goto("/fulfillment");
    await sunita.page.getByRole("button", { name: `Start processing ${order.orderNumber}` }).click();
    await expect(flash(sunita.page, `${order.orderNumber} is now processing.`)).toBeVisible();
    await sunita.page.getByRole("button", { name: /^Processing/ }).click();
    await sunita.page.getByRole("button", { name: `Mark packed ${order.orderNumber}` }).click();
    await expect(flash(sunita.page, `${order.orderNumber} is now packed.`)).toBeVisible();
    await sunita.page.getByRole("button", { name: /^Packed/ }).click();
    await sunita.page.getByRole("button", { name: `Ship order ${order.orderNumber}` }).click();
    await sunita.page.getByRole("dialog").getByLabel("Carrier").fill("Delhivery");
    await sunita.page.getByRole("dialog").getByLabel("Tracking number").fill("DLV0099887");
    await sunita.page.getByRole("dialog").getByRole("button", { name: "Ship order" }).click();
    await expect(flash(sunita.page, `${order.orderNumber} shipped.`)).toBeVisible();
    expect(await stock()).toMatchObject({ quantity: 26, reservedQuantity: 0 });

    // ============ 8. The admin delivers it ============
    await admin.page.goto(`/orders/${orderId}`);
    await admin.page.getByRole("button", { name: `Mark delivered ${order.orderNumber}` }).click();
    await expect(flash(admin.page, `${order.orderNumber} is now delivered.`)).toBeVisible();

    // ================= The story must add up everywhere =================

    // Stock and the movement history: +30 from the supplier, −4 for the customer
    await ravi.page.goto("/inventory");
    await ravi.page.getByRole("searchbox", { name: "Search" }).fill(names.sku);
    await expect(cardValue(rowOf(ravi.page, names.sku), "Current stock")).toHaveText("26");
    const { transactions } = await readAs("admin", `inventory/transactions?product=${product._id}&limit=20`);
    expect(transactions.map((t) => [t.type, t.quantity, t.referenceType]).sort()).toEqual([["STOCK_IN", 30, "PURCHASE_ORDER"], ["STOCK_OUT", 4, "ORDER"]].sort());

    // The reports
    const orders = await readAs("manager", `reports/orders?warehouse=${warehouse._id}`);
    expect(orders.summary).toMatchObject({ totalOrders: 1, salesOrders: 1, completedOrders: 1, revenue: 2240 });
    const inventory = await readAs("manager", `reports/inventory?warehouse=${warehouse._id}`);
    expect(inventory.summary).toMatchObject({ totalQuantity: 26, totalStockValue: 5200 }); // 26 × ₹200 at cost
    const suppliers = (await readAs("manager", "reports/suppliers")).rows.find((row) => row.supplierId === supplier._id);
    expect(suppliers).toMatchObject({ unitsOrdered: 30, unitsReceived: 30, fulfilmentRatePercent: 100, openPurchaseOrders: 0, receivedValue: 6000 });
    const performance = await readAs("manager", `reports/product-performance?warehouse=${warehouse._id}`);
    expect(performance.rows[0]).toMatchObject({ sku: names.sku, unitsSold: 4, revenue: 2240 });

    // The dashboard moved by exactly what happened: 1 category, 1 product, 1 warehouse, 1 supplier, 26 units, 1 delivered order
    const after = await kpis();
    expect(after.totalCategories - before.totalCategories).toBe(1);
    expect(after.totalProducts - before.totalProducts).toBe(1);
    expect(after.totalWarehouses - before.totalWarehouses).toBe(1);
    expect(after.totalSuppliers - before.totalSuppliers).toBe(1);
    expect(after.totalInventory - before.totalInventory).toBe(26);
    expect(after.completedOrders - before.completedOrders).toBe(1);
    expect(after.totalOrders - before.totalOrders).toBe(1);
    await admin.page.goto("/dashboard");
    await expect(admin.page.getByTestId("kpi-totalInventory")).toHaveText(new Intl.NumberFormat("en-IN").format(after.totalInventory));

    // Everyone who needed to know was told, and the people who did the action were not told about their own work
    expect(await titlesFor("manager2", po.poNumber)).toContain("Purchase request needs approval");
    expect(await titlesFor("manager", po.poNumber)).toEqual(expect.arrayContaining(["Purchase approved", "Supplier confirmed order", "Goods received"]));
    expect(await titlesFor(await (await import("../helpers/api.js")).loginApi(supplierUser.email, supplierUser.password), po.poNumber)).toContain("New purchase order");
    expect(await titlesFor("admin", order.orderNumber)).toContain("New order");
    expect(await titlesFor("staff", order.orderNumber)).toContain("Order delivered");

    // The audit trail names the right person for each stage
    const trail = async (entityType, entityId) => (await readAs("admin", `audit-logs?entityType=${entityType}&entityId=${entityId}&sort=oldest&limit=50`)).auditLogs;
    const by = (logs, action) => logs.find((entry) => entry.action === action)?.user.email;
    const poLogs = await trail("PurchaseOrder", purchaseId);
    expect(by(poLogs, "PURCHASE_APPROVED")).toBe(USERS.manager2.email);
    expect(by(poLogs, "PURCHASE_CONFIRMED_BY_SUPPLIER")).toBe(supplierUser.email);
    const orderLogs = await trail("Order", orderId);
    expect(by(orderLogs, "ORDER_CONFIRMED")).toBe(USERS.staff.email);
    expect(orderLogs.at(-1).user.email).toBe("admin@e2e.test"); // delivered by the admin
    expect(by(await trail("Product", product._id), "PRODUCT_CREATED")).toBe("admin@e2e.test");

    for (const p of [admin, ravi, neha, sunita]) await p.context.close();
    await supplierContext.close();
});

test("Journey 2: a low-stock alert → the manager sees it → moves stock from a full warehouse → the alert clears", async ({ browser }) => {
    test.setTimeout(180_000);
    const product = await makeProduct();
    const shop = await makeWarehouse({ capacity: 500 }); // the warehouse that runs short
    const depot = await makeWarehouse({ capacity: 500 }); // the one with plenty
    await stockIn({ product, warehouse: shop, quantity: 30 });
    await stockIn({ product, warehouse: depot, quantity: 100 });
    await flows.setReorderLevel(product, shop, 20);
    const before = (await kpis()).lowStockProducts;

    const neha = await browser.newContext({ storageState: statePath("manager2") });
    const nehaPage = await neha.newPage();
    const ravi = await browser.newContext({ storageState: statePath("manager") });
    const raviPage = await ravi.newPage();
    await nehaPage.goto("/dashboard");
    // The bell says "0 unread" until its first request answers, so wait for that before reading the number
    await nehaPage.waitForLoadState("networkidle");
    const unread = async () => Number(/(\d+) unread/.exec(await nehaPage.getByLabel(/^Notifications, /).getAttribute("aria-label"))[1]);
    const unreadBefore = await unread();

    // ---- Ravi sells / removes 15 from the shop: 15 left, below the level of 20 ----
    await raviPage.goto("/inventory");
    await raviPage.getByRole("button", { name: "Stock out", exact: true }).click();
    const out = raviPage.getByRole("dialog");
    await out.getByLabel("Product").selectOption(product._id);
    await out.getByLabel("Warehouse").selectOption(shop._id);
    await out.getByLabel("Quantity").fill("15");
    await out.getByLabel("Reason").fill("sold at the counter");
    await out.getByRole("button", { name: "Remove stock" }).click();
    await expect(flash(raviPage, "Stock removed.")).toBeVisible();

    // ---- Neha sees the alert in her bell and the shelf flagged ----
    await nehaPage.reload();
    await expect(nehaPage.getByLabel(`Notifications, ${unreadBefore + 1} unread`)).toBeVisible();
    await nehaPage.goto("/inventory");
    await nehaPage.getByRole("searchbox", { name: "Search" }).fill(product.sku);
    await expect(rowOf(nehaPage, shop.name)).toContainText("Low stock");
    await expect(rowOf(nehaPage, depot.name)).not.toContainText("Low stock");
    expect((await kpis()).lowStockProducts).toBe(before + 1);

    // The low-stock report says how short it is
    const report = await readAs("manager2", `reports/low-stock?warehouse=${shop._id}`);
    expect(report.rows[0]).toMatchObject({ availableQuantity: 15, reorderLevel: 20, shortage: 5, onOrderQuantity: 0 });

    // ---- Neha requests 10 units from the depot to the shop; Ravi (someone else) approves and moves it ----
    await nehaPage.goto("/transfers");
    await nehaPage.getByRole("button", { name: "New transfer" }).click();
    const form = nehaPage.getByRole("dialog");
    await form.getByLabel("Product").selectOption(product._id);
    await form.getByLabel("From warehouse").selectOption(depot._id);
    await form.getByLabel("To warehouse").selectOption(shop._id);
    await form.getByLabel("Quantity").fill("10");
    await form.getByRole("button", { name: "Request transfer" }).click();
    await expect(flash(nehaPage, "Transfer requested.")).toBeVisible();
    const transfer = (await readAs("admin", `transfers?product=${product._id}`)).transfers[0];

    await raviPage.goto("/transfers");
    await raviPage.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);
    await raviPage.getByRole("button", { name: `Approve ${transfer.transferNumber}` }).click();
    await expect(flash(raviPage, `${transfer.transferNumber} approved.`)).toBeVisible();
    await raviPage.getByRole("button", { name: `Dispatch ${transfer.transferNumber}` }).click();
    await raviPage.getByRole("dialog").getByRole("button", { name: "Dispatch" }).click();
    await expect(flash(raviPage, `${transfer.transferNumber} dispatched.`)).toBeVisible();
    await raviPage.getByRole("button", { name: `Receive ${transfer.transferNumber}` }).click();
    await raviPage.getByRole("dialog").getByRole("button", { name: "Receive" }).click();
    await expect(flash(raviPage, `${transfer.transferNumber} received.`)).toBeVisible();

    // ---- The shop has 25 again: the flag is gone everywhere, and nothing was lost on the way ----
    const quantity = async (warehouse) => (await readAs("admin", `inventory?product=${product._id}&warehouse=${warehouse._id}`)).inventories[0].quantity;
    expect(await quantity(shop)).toBe(25);
    expect(await quantity(depot)).toBe(90);
    expect((await quantity(shop)) + (await quantity(depot))).toBe(115); // 130 stocked − 15 sold, none lost in transit

    await nehaPage.goto("/inventory");
    await nehaPage.getByRole("searchbox", { name: "Search" }).fill(product.sku);
    await expect(rowOf(nehaPage, shop.name)).not.toContainText("Low stock");
    expect((await readAs("manager2", `reports/low-stock?warehouse=${shop._id}`)).summary.itemCount).toBe(0);
    expect((await kpis()).lowStockProducts).toBe(before);

    // The audit trail shows both managers' parts
    const { auditLogs } = await readAs("admin", `audit-logs?entityType=StockTransfer&entityId=${transfer._id}&sort=oldest`);
    expect(auditLogs.map((entry) => [entry.action, entry.user.email])).toEqual([
        ["TRANSFER_REQUESTED", USERS.manager2.email],
        ["TRANSFER_APPROVED", USERS.manager.email],
        ["TRANSFER_DISPATCHED", USERS.manager.email],
        ["TRANSFER_RECEIVED", USERS.manager.email]
    ]);
    await neha.close();
    await ravi.close();
    void goToNav;
    void asAdmin;
    void createVia;
});

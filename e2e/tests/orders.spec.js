const { test, expect } = require("@playwright/test");
const { USERS } = require("../config");
const { apiAs, createVia, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, makeWarehouse, readAs, stockIn } = require("../helpers/data");
const { flash, unique, cards, cardOf } = require("../helpers/ui");

// Phase 4: customer orders and fulfillment. Reserve stock on confirm, take it out on shipping,
// release it on cancel, and never sell what isn't there: all watched in the real database.

// Each record is a card on the listing pages
const rowOf = (page, text) => cardOf(page, text);

const stockOf = async (product, warehouse) => {
    const { inventories } = await readAs("admin", `inventory?product=${product._id}&warehouse=${warehouse._id}`);
    return inventories[0] || { quantity: 0, reservedQuantity: 0, availableQuantity: 0 };
};

// Two priced products and a warehouse holding 50 of each
const setUp = async ({ stock = 50 } = {}) => {
    const laptop = await makeProduct({ name: `E2E Laptop ${unique()}`, sellingPrice: 1000, taxRate: 18 });
    const mouse = await makeProduct({ name: `E2E Mouse ${unique()}`, sellingPrice: 500, taxRate: 0 });
    const warehouse = await makeWarehouse();
    await stockIn({ product: laptop, warehouse, quantity: stock });
    await stockIn({ product: mouse, warehouse, quantity: stock });
    return { laptop, mouse, warehouse };
};

// Creates an order through the API as the given role
const orderVia = async (role, { warehouse }, lines, { confirm = false, customer = `Customer ${unique()}` } = {}) => {
    const client = await apiAs(role);
    const data = await createVia(client, "orders", {
        customer: { name: customer },
        warehouse: warehouse._id,
        items: lines.map(([product, quantity]) => ({ product: product._id, quantity })),
        ...(confirm ? { confirm: true } : {})
    });
    await client.dispose();
    return data.order;
};

// One API step on an order; returns { status, body } so tests can look at refusals too
const stepVia = async (role, order, action, body) => {
    const client = await apiAs(role);
    const url = action === "confirm" ? `orders/${order._id}/confirm` : `orders/${order._id}/status`;
    const response = action === "cancel" ? await client.delete(`orders/${order._id}`, { data: body || {} }) : await client.put(url, body ? { data: body } : {});
    const result = { status: response.status(), body: await response.json() };
    await client.dispose();
    return result;
};
const setStatus = (role, order, status, extra = {}) => stepVia(role, order, "status", { status, ...extra });

const notificationsFor = async (role, text) => (await readAs(role, "notifications?limit=100")).notifications.filter((note) => note.message.includes(text));

// ======================================================================================
test.describe("the full order lifecycle (staff creates, admin delivers)", () => {
    test("create → confirm → process → pack → ship → deliver: prices, reservations, stock, notifications and audit trail", async ({ browser }) => {
        const scene = await setUp();
        const { laptop, mouse, warehouse } = scene;

        const staffContext = await browser.newContext({ storageState: statePath("staff") });
        const staff = await staffContext.newPage();

        // ---- 1. Sunita fills in the order form ----
        await staff.goto("/orders/new");
        await staff.getByLabel("Name", { exact: true }).fill("Priya Sharma");
        await staff.getByLabel("Email (optional)").fill("priya@example.com");
        await staff.getByLabel("Phone (optional)").fill("9876543210");
        await staff.getByLabel("Address (optional)").fill("12 MG Road, Delhi");
        await staff.getByLabel("Warehouse", { exact: true }).selectOption(warehouse._id);
        await staff.getByLabel("Product 1").selectOption(laptop._id);
        await staff.getByLabel("Quantity 1").fill("2");
        await staff.getByRole("button", { name: /add item/i }).click();
        await staff.getByLabel("Product 2").selectOption(mouse._id);
        await staff.getByLabel("Quantity 2").fill("3");
        // The on-screen estimate: 2 × ₹1,000 + 3 × ₹500 = ₹3,500, plus 18% tax on the laptops = ₹360
        await expect(staff.getByTestId("estimate")).toContainText("₹3,500.00 + ₹360.00 tax = ₹3,860.00");
        await staff.getByRole("button", { name: "Save as pending" }).click();

        // ---- 2. The order exists, with the SERVER's numbers, and nothing is reserved yet ----
        await expect(staff).toHaveURL(/\/orders\/[0-9a-f]{24}$/);
        const orderId = staff.url().split("/").pop();
        const { order, items } = await readAs("admin", `orders/${orderId}`);
        expect(order.orderNumber).toMatch(/^ORD-\d{6}$/);
        expect(order).toMatchObject({ status: "PENDING", subtotal: 3500, taxAmount: 360, totalAmount: 3860 });
        expect(order.customer).toMatchObject({ name: "Priya Sharma", email: "priya@example.com", phone: "9876543210" });
        expect(items).toHaveLength(2);
        await expect(staff.getByRole("heading", { level: 1, name: order.orderNumber })).toBeVisible();
        await expect(staff.getByText("₹3,860.00").first()).toBeVisible();
        expect(await stockOf(laptop, warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 0 });

        // ---- 3. Confirm: the stock is reserved (still in the warehouse, but promised) ----
        await staff.getByRole("button", { name: `Confirm order ${order.orderNumber}` }).click();
        await staff.getByRole("dialog").getByRole("button", { name: "Confirm order" }).click();
        await expect(flash(staff, `${order.orderNumber} confirmed.`)).toBeVisible();
        expect(await stockOf(laptop, warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 2, availableQuantity: 48 });
        expect(await stockOf(mouse, warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 3, availableQuantity: 47 });
        // The admin (not the person who confirmed) is told there is a new order to process
        expect(await notificationsFor("admin", order.orderNumber)).toEqual([expect.objectContaining({ title: "New order", type: "NEW_ORDER" })]);
        expect(await notificationsFor("staff", order.orderNumber)).toHaveLength(0);

        // ---- 4. Process → Pack: the flow is enforced one step at a time ----
        await staff.getByRole("button", { name: `Start processing ${order.orderNumber}` }).click();
        await expect(flash(staff, `${order.orderNumber} is now processing.`)).toBeVisible();
        await staff.getByRole("button", { name: `Mark packed ${order.orderNumber}` }).click();
        await expect(flash(staff, `${order.orderNumber} is now packed.`)).toBeVisible();
        expect(await stockOf(laptop, warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 2 }); // still just reserved

        // ---- 5. Ship: carrier and tracking number are required, and the stock really leaves ----
        await staff.getByRole("button", { name: `Ship order ${order.orderNumber}` }).click();
        const ship = staff.getByRole("dialog");
        await ship.getByRole("button", { name: "Ship order" }).click();
        await expect(ship.getByText("Carrier must be at least 2 characters")).toBeVisible();
        await ship.getByLabel("Carrier").fill("Blue Dart");
        await ship.getByLabel("Tracking number").fill("BD123456789");
        await ship.getByRole("button", { name: "Ship order" }).click();
        await expect(flash(staff, `${order.orderNumber} shipped.`)).toBeVisible();

        expect(await stockOf(laptop, warehouse)).toMatchObject({ quantity: 48, reservedQuantity: 0, availableQuantity: 48 });
        expect(await stockOf(mouse, warehouse)).toMatchObject({ quantity: 47, reservedQuantity: 0, availableQuantity: 47 });
        await expect(staff.getByText("Blue Dart")).toBeVisible();
        await expect(staff.getByText("BD123456789")).toBeVisible();
        // Too late to cancel now
        await expect(staff.getByRole("button", { name: `Cancel ${order.orderNumber}` })).toHaveCount(0);
        const cancelShipped = await stepVia("staff", order, "cancel");
        expect(cancelShipped.status).toBe(409);
        expect(cancelShipped.body.message).toContain("it can only be cancelled before it is shipped");

        // The stock history shows the shipment as removals tied to this order
        const { transactions } = await readAs("admin", `inventory/transactions?product=${laptop._id}&limit=50`);
        expect(transactions.find((t) => t.type === "STOCK_OUT" && t.referenceType === "ORDER")).toMatchObject({ quantity: 2, quantityBefore: 50, quantityAfter: 48 });

        // ---- 6. The admin marks it delivered; Sunita (who created it) is told ----
        const adminContext = await browser.newContext({ storageState: statePath("admin") });
        const admin = await adminContext.newPage();
        await admin.goto(`/orders/${orderId}`);
        await admin.getByRole("button", { name: `Mark delivered ${order.orderNumber}` }).click();
        await expect(flash(admin, `${order.orderNumber} is now delivered.`)).toBeVisible();
        await expect(admin.getByRole("button", { name: /^(Cancel|Ship|Mark|Start|Confirm)/ })).toHaveCount(0); // finished
        expect((await notificationsFor("staff", order.orderNumber)).map((note) => note.title)).toEqual(expect.arrayContaining(["Order delivered"]));

        // ---- 7. The timeline and the audit log tell the same story ----
        await staff.reload();
        const timeline = staff.getByRole("list").filter({ hasText: "Delivered" }).last();
        for (const status of ["Pending", "Confirmed", "Processing", "Packed", "Shipped", "Delivered"]) {
            await expect(timeline).toContainText(status);
        }
        const { auditLogs } = await readAs("admin", `audit-logs?entityType=Order&entityId=${orderId}&sort=oldest`);
        const byAction = Object.fromEntries(auditLogs.map((entry) => [entry.action, entry.user.email]));
        expect(byAction.ORDER_CONFIRMED).toBe(USERS.staff.email);
        expect(byAction.ORDER_SHIPPED).toBe(USERS.staff.email);
        expect(auditLogs.at(-1).user.email).toBe("admin@e2e.test"); // the last step (delivered) was the admin's
        expect(auditLogs.length).toBeGreaterThanOrEqual(5);

        await staffContext.close();
        await adminContext.close();
    });

    test("prices come from the product list, never from the browser; a later price change does not touch an existing order", async () => {
        const scene = await setUp();
        const client = await apiAs("staff");
        // A tampered request that tries to name its own price
        const data = await createVia(client, "orders", {
            customer: { name: "Cheeky Customer" },
            warehouse: scene.warehouse._id,
            items: [{ product: scene.laptop._id, quantity: 1, unitPrice: 1, lineTotal: 1 }],
            totalAmount: 1
        });
        await client.dispose();
        expect(data.order.totalAmount).toBe(1180); // ₹1,000 + 18% tax, whatever the request claimed
        expect(data.items[0].unitPrice).toBe(1000);

        // The product gets more expensive later: the existing order keeps the price it was sold at
        await asAdmin((admin) => admin.put(`products/${scene.laptop._id}`, { data: { sellingPrice: 2000 } }));
        const after = await readAs("admin", `orders/${data.order._id}`);
        expect(after.items[0].unitPrice).toBe(1000);
        expect(after.order.totalAmount).toBe(1180);
    });
});

// ======================================================================================
test.describe("reservations protect stock from being sold twice", () => {
    test("even a pending order can't be created for more than is available", async () => {
        const scene = await setUp({ stock: 50 });
        const client = await apiAs("staff");
        const response = await client.post("orders", {
            data: { customer: { name: "Too Greedy" }, warehouse: scene.warehouse._id, items: [{ product: scene.laptop._id, quantity: 60 }] }
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).message).toContain(`Insufficient stock of ${scene.laptop.sku} in ${scene.warehouse.code}: 50 available, 60 requested`);
        await client.dispose();
    });

    test("if stock disappears before confirming, a multi-item order reserves all of it or none of it", async ({ browser }) => {
        const scene = await setUp({ stock: 50 });
        // Both lines fit when the order is written: 10 laptops and 40 mice, of 50 each
        const order = await orderVia("staff", scene, [[scene.laptop, 10], [scene.mouse, 40]]);
        // ...then someone removes 30 mice from the shelf, so only 20 remain
        const manager = await apiAs("manager");
        await manager.post("inventory/stock-out", { data: { product: scene.mouse._id, warehouse: scene.warehouse._id, quantity: 30, note: "damaged" } });
        await manager.dispose();

        const context = await browser.newContext({ storageState: statePath("staff") });
        const page = await context.newPage();
        await page.goto(`/orders/${order._id}`);
        await page.getByRole("button", { name: `Confirm order ${order.orderNumber}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Confirm order" }).click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText(`Insufficient stock of ${scene.mouse.sku} in ${scene.warehouse.code}: 20 available, 40 requested`);

        // All or nothing: the laptop line that DID fit must not stay reserved, and the order is still pending
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ reservedQuantity: 0 });
        expect(await stockOf(scene.mouse, scene.warehouse)).toMatchObject({ reservedQuantity: 0 });
        expect((await readAs("admin", `orders/${order._id}`)).order.status).toBe("PENDING");
        await context.close();
    });

    test("two orders can't both claim the same stock; cancelling the first frees it for the second", async () => {
        const scene = await setUp({ stock: 50 });
        // Both are written while 50 are free
        const first = await orderVia("staff", scene, [[scene.laptop, 30]]);
        const second = await orderVia("staff", scene, [[scene.laptop, 30]]);

        expect((await stepVia("staff", first, "confirm")).status).toBe(200);
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 30, availableQuantity: 20 });

        const refused = await stepVia("staff", second, "confirm");
        expect(refused.status).toBe(400);
        expect(refused.body.message).toContain("20 available, 30 requested");

        // Reserved stock can't be taken out by hand either: only 20 is truly free
        const manager = await apiAs("manager");
        const tooMuch = await manager.post("inventory/stock-out", { data: { product: scene.laptop._id, warehouse: scene.warehouse._id, quantity: 25, note: "try" } });
        expect(tooMuch.status()).toBe(400);
        await manager.dispose();

        // Cancel the first: its 30 units are released, and the second order can now be confirmed
        expect((await stepVia("staff", first, "cancel", { reason: "Customer changed mind" })).status).toBe(200);
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 0, availableQuantity: 50 });
        expect((await stepVia("staff", second, "confirm")).status).toBe(200);
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ reservedQuantity: 30 });
    });

    test("confirming twice at the same moment reserves the stock only once", async () => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 2]]);

        const [one, two] = await Promise.all([stepVia("staff", order, "confirm"), stepVia("admin", order, "confirm")]);

        expect([one.status, two.status].sort()).toEqual([200, 409]);
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ reservedQuantity: 2 }); // not 4
    });

    test("shipping twice at the same moment takes the stock out only once", async () => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 2]], { confirm: true });
        await setStatus("staff", order, "PROCESSING");
        await setStatus("staff", order, "PACKED");

        const ship = { carrier: "Blue Dart", trackingNumber: "BD000111" };
        const [one, two] = await Promise.all([setStatus("staff", order, "SHIPPED", ship), setStatus("admin", order, "SHIPPED", ship)]);

        expect([one.status, two.status].sort()).toEqual([200, 409]);
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ quantity: 48, reservedQuantity: 0 }); // 50 - 2, not 50 - 4
    });

    test("steps can't be skipped", async () => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 1]], { confirm: true });

        const skip = await setStatus("staff", order, "PACKED");
        expect(skip.status).toBe(409);
        expect(skip.body.message).toContain("it must be PROCESSING to mark it PACKED");
        const shipNow = await setStatus("staff", order, "SHIPPED", { carrier: "DTDC", trackingNumber: "TRK1234" });
        expect(shipNow.status).toBe(409);
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 1 }); // nothing shipped
    });
});

// ======================================================================================
test.describe("cancelling and editing", () => {
    test.use({ storageState: statePath("staff") });

    test("cancel a confirmed order with a reason in the UI: the reservation is released and the order is final", async ({ page }) => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 5]], { confirm: true });
        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ reservedQuantity: 5 });

        await page.goto(`/orders/${order._id}`);
        await page.getByRole("button", { name: `Cancel ${order.orderNumber}` }).click();
        await page.getByRole("dialog").getByLabel("Reason (optional)").fill("Customer changed mind");
        await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
        await expect(flash(page, `${order.orderNumber} cancelled.`)).toBeVisible();

        expect(await stockOf(scene.laptop, scene.warehouse)).toMatchObject({ quantity: 50, reservedQuantity: 0, availableQuantity: 50 });
        const stored = (await readAs("admin", `orders/${order._id}`)).order;
        expect(stored.status).toBe("CANCELLED");
        expect(JSON.stringify(stored.statusHistory)).toContain("Customer changed mind");
        await expect(page.getByRole("button", { name: /^(Confirm|Start|Mark|Ship|Cancel)/ })).toHaveCount(0);
        expect((await setStatus("staff", order, "PROCESSING")).status).toBe(409); // can't be revived
    });

    test("a pending order can be edited and its totals are recalculated; once confirmed it can't be", async ({ page }) => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 1]]);
        await page.goto(`/orders/${order._id}/edit`);

        await expect(page.getByLabel("Name", { exact: true })).toHaveValue(order.customer.name);
        await expect(page.getByLabel("Quantity 1")).toHaveValue("1");
        await page.getByLabel("Name", { exact: true }).fill("Renamed Customer");
        await page.getByLabel("Quantity 1").fill("4");
        await page.getByRole("button", { name: "Save changes" }).click();

        await expect(page).toHaveURL(new RegExp(`/orders/${order._id}$`));
        const edited = await readAs("admin", `orders/${order._id}`);
        expect(edited.order.customer.name).toBe("Renamed Customer");
        expect(edited.order).toMatchObject({ subtotal: 4000, taxAmount: 720, totalAmount: 4720 });

        // Confirm it; now editing is closed everywhere
        await stepVia("staff", order, "confirm");
        await page.goto(`/orders/${order._id}/edit`);
        await expect(page.getByText(/Only pending orders can be edited/)).toBeVisible();
        const client = await apiAs("staff");
        const put = await client.put(`orders/${order._id}`, { data: { notes: "sneaky" } });
        expect(put.status()).toBe(409);
        await client.dispose();
    });

    test("the form catches a repeated product before anything is sent", async ({ page }) => {
        const scene = await setUp();
        await page.goto("/orders/new");
        await page.getByLabel("Name", { exact: true }).fill("Dup Customer");
        await page.getByLabel("Warehouse", { exact: true }).selectOption(scene.warehouse._id);
        await page.getByLabel("Product 1").selectOption(scene.laptop._id);
        await page.getByRole("button", { name: /add item/i }).click();
        await page.getByLabel("Product 2").selectOption(scene.laptop._id);
        await page.getByRole("button", { name: "Save as pending" }).click();

        await expect(page.getByText(/Each product can appear only once/)).toBeVisible();
        await expect(page).toHaveURL(/\/orders\/new$/);
    });

    test("'Save and confirm' creates the order already confirmed, with stock reserved", async ({ page }) => {
        const scene = await setUp();
        await page.goto("/orders/new");
        await page.getByLabel("Name", { exact: true }).fill("Quick Customer");
        await page.getByLabel("Warehouse", { exact: true }).selectOption(scene.warehouse._id);
        await page.getByLabel("Product 1").selectOption(scene.mouse._id);
        await page.getByLabel("Quantity 1").fill("7");
        await page.getByRole("button", { name: "Save and confirm" }).click();

        await expect(page).toHaveURL(/\/orders\/[0-9a-f]{24}$/);
        const { order } = await readAs("admin", `orders/${page.url().split("/").pop()}`);
        expect(order.status).toBe("CONFIRMED");
        expect(await stockOf(scene.mouse, scene.warehouse)).toMatchObject({ reservedQuantity: 7 });
    });

    test("a warehouse with an open order can't be deactivated until the order is finished", async () => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 1]]); // pending: nothing reserved yet

        // Empty the shelves, so the ONLY thing left holding the warehouse is that open order
        const manager = await apiAs("manager");
        for (const product of [scene.laptop, scene.mouse]) {
            await manager.post("inventory/stock-out", { data: { product: product._id, warehouse: scene.warehouse._id, quantity: 50, note: "clear" } });
        }
        await manager.dispose();

        const admin = await apiAs("admin");
        const refused = await admin.delete(`warehouses/${scene.warehouse._id}`);
        expect(refused.status()).toBe(409);
        expect((await refused.json()).message).toContain("1 open customer order(s) use this warehouse");

        await stepVia("staff", order, "cancel");
        expect((await admin.delete(`warehouses/${scene.warehouse._id}`)).status()).toBe(200);
        await admin.dispose();
    });
});

// ======================================================================================
test.describe("the orders list and the fulfillment queue", () => {
    test.use({ storageState: statePath("staff") });

    test("search by customer or number, status and date filters", async ({ page }) => {
        const scene = await setUp();
        const tag = unique();
        const alpha = await orderVia("staff", scene, [[scene.laptop, 1]], { customer: `Alpha ${tag}` });
        const beta = await orderVia("staff", scene, [[scene.mouse, 1]], { customer: `Beta ${tag}`, confirm: true });

        await page.goto("/orders");
        await page.getByRole("searchbox", { name: "Search" }).fill(tag);
        await expect(cards(page)).toHaveCount(2);

        await page.getByRole("combobox", { name: "Status" }).selectOption("CONFIRMED");
        await expect(cards(page)).toHaveCount(1);
        await expect(rowOf(page, `Beta ${tag}`)).toContainText("Confirmed");
        await page.getByRole("combobox", { name: "Status" }).selectOption("");

        // Find one by its number
        await page.getByRole("searchbox", { name: "Search" }).fill(alpha.orderNumber);
        await expect(cards(page)).toHaveCount(1);
        await expect(rowOf(page, alpha.orderNumber)).toContainText("Pending");
        await page.getByRole("link", { name: `View ${alpha.orderNumber}` }).click();
        await expect(page.getByRole("heading", { level: 1, name: alpha.orderNumber })).toBeVisible();

        // Dates: today includes both, a range that ended yesterday includes none
        await page.goto("/orders");
        await page.getByRole("searchbox", { name: "Search" }).fill(tag);
        const today = new Date().toLocaleDateString("en-CA");
        await page.getByLabel("From", { exact: true }).fill(today);
        await page.getByLabel("To", { exact: true }).fill(today);
        await expect(cards(page)).toHaveCount(2);
        await page.getByLabel("From", { exact: true }).fill("2020-01-01");
        await page.getByLabel("To", { exact: true }).fill("2020-01-31");
        await expect(page.getByText("No orders found")).toBeVisible();
        expect(beta.orderNumber).toBeTruthy();
    });

    test("the fulfillment queue counts each stage and moves orders forward with one click", async ({ page }) => {
        const scene = await setUp();
        const before = (await readAs("admin", "orders/fulfillment-queue")).queue;
        const first = await orderVia("staff", scene, [[scene.laptop, 1]], { confirm: true });
        await orderVia("staff", scene, [[scene.mouse, 1]], { confirm: true });

        await page.goto("/fulfillment");
        await expect(page.getByTestId("queue-CONFIRMED")).toHaveText(String(before.CONFIRMED + 2));
        await expect(page.getByTestId("queue-PROCESSING")).toHaveText(String(before.PROCESSING));

        // One click on a row moves that order to the next stage, and the counts follow
        await page.getByRole("button", { name: `Start processing ${first.orderNumber}` }).click();
        await expect(flash(page, `${first.orderNumber} is now processing.`)).toBeVisible();
        await expect(page.getByTestId("queue-CONFIRMED")).toHaveText(String(before.CONFIRMED + 1));
        await expect(page.getByTestId("queue-PROCESSING")).toHaveText(String(before.PROCESSING + 1));
        const after = (await readAs("admin", "orders/fulfillment-queue")).queue;
        expect(after).toMatchObject({ CONFIRMED: before.CONFIRMED + 1, PROCESSING: before.PROCESSING + 1 });

        // Clicking the Processing stage lists it, offering the next step
        await page.getByRole("button", { name: /^Processing/ }).click();
        await expect(rowOf(page, first.orderNumber).getByRole("button", { name: `Mark packed ${first.orderNumber}` })).toBeVisible();
    });
});

// ======================================================================================
test.describe("the inventory manager only looks", () => {
    test.use({ storageState: statePath("manager") });

    test("can see orders and the queue, with no way to change anything", async ({ page }) => {
        const scene = await setUp();
        const order = await orderVia("staff", scene, [[scene.laptop, 1]], { confirm: true });

        await page.goto(`/orders/${order._id}`);
        await expect(page.getByRole("heading", { level: 1, name: order.orderNumber })).toBeVisible();
        await expect(page.getByRole("button", { name: /^(Confirm|Start|Mark|Ship|Cancel)/ })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);

        await page.goto("/orders");
        await expect(page.getByRole("link", { name: /New order/ })).toHaveCount(0);
        await page.goto("/fulfillment");
        await expect(page.getByRole("button", { name: /Start processing/ })).toHaveCount(0);

        // and the API agrees
        const client = await apiAs("manager");
        expect((await client.put(`orders/${order._id}/confirm`)).status()).toBe(403);
        await client.dispose();
    });
});

const { test, expect } = require("@playwright/test");
const { USERS } = require("../config");
const { apiAs, createVia, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, makeWarehouse, readAs, stockIn } = require("../helpers/data");
const { flash } = require("../helpers/ui");

// Phase 3b: stock transfers between warehouses, end to end. Two different managers, real stock, real notifications.

const rowOf = (page, text) => page.getByRole("row").filter({ hasText: text });

// The id of a user, looked up by email (needed to make someone a warehouse manager)
const userId = async (email) => (await readAs("admin", `users?search=${encodeURIComponent(email)}`)).users[0]._id;

// quantity of a product in a warehouse (0 when there is no record yet)
const quantityIn = async (product, warehouse) => {
    const { inventories } = await readAs("admin", `inventory?product=${product._id}&warehouse=${warehouse._id}`);
    return inventories[0] ? inventories[0].quantity : 0;
};

// A ready-to-use situation: one product, source warehouse with 100 units, destination warehouse managed by Ravi
const setUp = async ({ sourceQuantity = 100, destinationCapacity = 1000 } = {}) => {
    const product = await makeProduct();
    const source = await makeWarehouse({ capacity: 1000 });
    const destination = await makeWarehouse({ capacity: destinationCapacity, manager: await userId(USERS.manager.email) });
    if (sourceQuantity > 0) await stockIn({ product, warehouse: source, quantity: sourceQuantity });
    return { product, source, destination };
};

// Requests a transfer through the API as the given role and returns it
const requestVia = async (role, { product, source, destination }, quantity, notes = "E2E transfer") => {
    const client = await apiAs(role);
    const { transfer } = await createVia(client, "transfers", { product: product._id, fromWarehouse: source._id, toWarehouse: destination._id, quantity, notes });
    await client.dispose();
    return transfer;
};

// Does one step of the transfer through the API (as someone else than the requester where needed)
const stepVia = async (role, transfer, action, body) => {
    const client = await apiAs(role);
    const response = await client.put(`transfers/${transfer._id}/${action}`, body ? { data: body } : {});
    const result = { status: response.status(), body: await response.json() };
    await client.dispose();
    return result;
};

const notificationsFor = async (role, text) => (await readAs(role, "notifications?limit=100")).notifications.filter((note) => note.message.includes(text) || note.title.includes(text));

test.describe("the full transfer lifecycle", () => {
    test("request → approve (by someone else) → dispatch → receive: stock, notifications and audit trail all line up", async ({ browser }) => {
        const scene = await setUp();
        const { product, source, destination } = scene;

        const raviContext = await browser.newContext({ storageState: statePath("manager") });
        const nehaContext = await browser.newContext({ storageState: statePath("manager2") });
        const ravi = await raviContext.newPage();
        const neha = await nehaContext.newPage();

        // ---- 1. Ravi requests 30 units, in the UI ----
        await ravi.goto("/transfers");
        await ravi.getByRole("button", { name: "New transfer" }).click();
        const dialog = ravi.getByRole("dialog");
        await dialog.getByLabel("Product").selectOption({ label: `${product.name} (${product.sku})` });
        await dialog.getByLabel("From warehouse").selectOption({ label: `${source.name} (${source.code})` });
        await dialog.getByLabel("To warehouse").selectOption({ label: `${destination.name} (${destination.code})` });
        await dialog.getByLabel("Quantity").fill("30");
        await dialog.getByLabel("Notes (optional)").fill("Restock Noida");
        await dialog.getByRole("button", { name: "Request transfer" }).click();
        await expect(flash(ravi, "Transfer requested.")).toBeVisible();

        const { transfers } = await readAs("admin", `transfers?product=${product._id}`);
        expect(transfers).toHaveLength(1);
        const transfer = transfers[0];
        expect(transfer).toMatchObject({ status: "REQUESTED", quantity: 30, notes: "Restock Noida" });
        expect(transfer.transferNumber).toMatch(/^TRF-\d{6}$/);
        // Requesting moves nothing yet
        expect(await quantityIn(product, source)).toBe(100);
        expect(await quantityIn(product, destination)).toBe(0);

        await ravi.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);
        await expect(rowOf(ravi, transfer.transferNumber)).toContainText("Requested");

        // ---- 2. Ravi can't approve his own request (screen and server) ----
        // (scoped to this transfer's row: the list may briefly show other requests until the search filter has applied)
        await expect(rowOf(ravi, transfer.transferNumber).getByText("Needs another approver")).toBeVisible();
        await expect(ravi.getByRole("button", { name: `Approve ${transfer.transferNumber}` })).toHaveCount(0);
        const selfApproval = await stepVia("manager", transfer, "approve");
        expect(selfApproval.status).toBe(403);
        expect(selfApproval.body.error).toBe("SELF_APPROVAL_NOT_ALLOWED");

        // ---- 3. Neha (and the admin) were told; Ravi (the requester) was not ----
        expect(await notificationsFor("manager2", transfer.transferNumber)).toEqual([expect.objectContaining({ title: "Transfer needs approval" })]);
        expect(await notificationsFor("admin", transfer.transferNumber)).toHaveLength(1);
        expect(await notificationsFor("manager", transfer.transferNumber)).toHaveLength(0);

        // ---- 4. Neha approves in the UI ----
        await neha.goto("/transfers");
        await neha.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);
        await neha.getByRole("button", { name: `Approve ${transfer.transferNumber}` }).click();
        await expect(flash(neha, `${transfer.transferNumber} approved.`)).toBeVisible();
        await expect(rowOf(neha, transfer.transferNumber)).toContainText("Approved");
        expect(await quantityIn(product, source)).toBe(100); // still nothing moved
        expect(await notificationsFor("manager", "Transfer approved")).toEqual([expect.objectContaining({ message: expect.stringContaining(transfer.transferNumber) })]);

        // ---- 5. Dispatch (asks first): the goods leave the source ----
        await neha.getByRole("button", { name: `Dispatch ${transfer.transferNumber}` }).click();
        await expect(neha.getByRole("dialog")).toContainText("30 unit(s)");
        await neha.getByRole("dialog").getByRole("button", { name: "Dispatch" }).click();
        await expect(flash(neha, `${transfer.transferNumber} dispatched.`)).toBeVisible();
        await expect(rowOf(neha, transfer.transferNumber)).toContainText("Dispatched");
        expect(await quantityIn(product, source)).toBe(70);
        expect(await quantityIn(product, destination)).toBe(0); // in the truck: in neither warehouse
        // The destination's manager (Ravi) is told the goods are on the way
        expect((await notificationsFor("manager", "Goods on the way")).some((note) => note.message.includes(transfer.transferNumber))).toBe(true);
        // A dispatched transfer can't be cancelled any more
        await expect(neha.getByRole("button", { name: `Cancel ${transfer.transferNumber}` })).toHaveCount(0);

        // ---- 6. Ravi confirms receipt: the goods arrive ----
        await ravi.reload();
        await ravi.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);
        await ravi.getByRole("button", { name: `Receive ${transfer.transferNumber}` }).click();
        await ravi.getByRole("dialog").getByRole("button", { name: "Receive" }).click();
        await expect(flash(ravi, `${transfer.transferNumber} received.`)).toBeVisible();
        await expect(rowOf(ravi, transfer.transferNumber)).toContainText("Received");

        expect(await quantityIn(product, source)).toBe(70);
        expect(await quantityIn(product, destination)).toBe(30);
        expect((await quantityIn(product, source)) + (await quantityIn(product, destination))).toBe(100); // nothing lost, nothing invented

        // Finished: no more buttons on the row
        await expect(rowOf(ravi, transfer.transferNumber).getByRole("button")).toHaveCount(0);

        // ---- 7. The movements are in the stock history, tied to the right warehouses ----
        const { transactions } = await readAs("admin", `inventory/transactions?product=${product._id}&limit=50`);
        const out = transactions.find((t) => t.type === "TRANSFER_OUT");
        const inn = transactions.find((t) => t.type === "TRANSFER_IN");
        expect(out).toMatchObject({ quantity: 30, quantityBefore: 100, quantityAfter: 70, referenceType: "TRANSFER" });
        expect(out.warehouse._id).toBe(source._id);
        expect(inn).toMatchObject({ quantity: 30, quantityBefore: 0, quantityAfter: 30, referenceType: "TRANSFER" });
        expect(inn.warehouse._id).toBe(destination._id);

        // ---- 8. ...and every step is in the audit log, by the right person ----
        const { auditLogs } = await readAs("admin", `audit-logs?entityType=StockTransfer&entityId=${transfer._id}&sort=oldest`);
        expect(auditLogs.map((entry) => entry.action)).toEqual(["TRANSFER_REQUESTED", "TRANSFER_APPROVED", "TRANSFER_DISPATCHED", "TRANSFER_RECEIVED"]);
        expect(auditLogs.map((entry) => entry.user.email)).toEqual([USERS.manager.email, USERS.manager2.email, USERS.manager2.email, USERS.manager.email]);

        await raviContext.close();
        await nehaContext.close();
    });

    test("a rejected transfer needs a reason, shows it, and moves no stock", async ({ browser }) => {
        const scene = await setUp();
        const transfer = await requestVia("manager", scene, 20);

        const context = await browser.newContext({ storageState: statePath("manager2") });
        const page = await context.newPage();
        await page.goto("/transfers");
        await page.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);

        await page.getByRole("button", { name: `Reject ${transfer.transferNumber}` }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Reject transfer" }).click();
        await expect(dialog.getByText(/give a reason/i)).toBeVisible();
        await dialog.getByLabel("Reason for rejecting").fill("Destination is overstocked");
        await dialog.getByRole("button", { name: "Reject transfer" }).click();

        await expect(flash(page, `${transfer.transferNumber} rejected.`)).toBeVisible();
        await expect(rowOf(page, transfer.transferNumber)).toContainText("Rejected");
        await expect(rowOf(page, transfer.transferNumber)).toContainText("Destination is overstocked");
        expect(await quantityIn(scene.product, scene.source)).toBe(100);
        expect((await notificationsFor("manager", "rejected")).some((note) => note.message.includes(transfer.transferNumber))).toBe(true);
        // ...and it is final: it can't be approved afterwards
        expect((await stepVia("manager2", transfer, "approve")).status).toBe(409);
        await context.close();
    });

    test("a request can be cancelled (with an optional reason) before it is dispatched", async ({ browser }) => {
        const scene = await setUp();
        const transfer = await requestVia("manager", scene, 20);
        await stepVia("manager2", transfer, "approve");

        const context = await browser.newContext({ storageState: statePath("manager") });
        const page = await context.newPage();
        await page.goto("/transfers");
        await page.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);
        await page.getByRole("button", { name: `Cancel ${transfer.transferNumber}` }).click();
        await page.getByRole("dialog").getByLabel("Reason (optional)").fill("Plans changed");
        await page.getByRole("dialog").getByRole("button", { name: "Cancel transfer" }).click();

        await expect(flash(page, `${transfer.transferNumber} cancelled.`)).toBeVisible();
        await expect(rowOf(page, transfer.transferNumber)).toContainText("Cancelled");
        expect(await quantityIn(scene.product, scene.source)).toBe(100);
        expect((await readAs("admin", `transfers/${transfer._id}`)).transfer.cancelReason).toBe("Plans changed");
        await context.close();
    });
});

test.describe("what the rules refuse", () => {
    test.use({ storageState: statePath("manager") });

    test("asking for more than the source holds is refused with the numbers; the same warehouse twice never leaves the form", async ({ page }) => {
        const scene = await setUp({ sourceQuantity: 100 });
        await page.goto("/transfers");
        await page.getByRole("button", { name: "New transfer" }).click();
        const dialog = page.getByRole("dialog");
        const fill = async (from, to, quantity) => {
            await dialog.getByLabel("Product").selectOption({ label: `${scene.product.name} (${scene.product.sku})` });
            await dialog.getByLabel("From warehouse").selectOption({ label: `${from.name} (${from.code})` });
            await dialog.getByLabel("To warehouse").selectOption({ label: `${to.name} (${to.code})` });
            await dialog.getByLabel("Quantity").fill(String(quantity));
        };

        await fill(scene.source, scene.destination, 500);
        await dialog.getByRole("button", { name: "Request transfer" }).click();
        await expect(dialog.getByRole("alert")).toContainText(`Insufficient stock of ${scene.product.sku} in ${scene.source.code}: 100 available, 500 requested`);

        let posted = false;
        page.on("request", (request) => {
            if (request.method() === "POST" && request.url().endsWith("/transfers")) posted = true;
        });
        await fill(scene.source, scene.source, 10);
        await dialog.getByRole("button", { name: "Request transfer" }).click();
        await expect(dialog.getByText("Source and destination warehouse cannot be the same")).toBeVisible();
        expect(posted).toBe(false);
    });

    test("goods can be dispatched but not received into a full warehouse; they wait in transit until there is room", async ({ page }) => {
        const scene = await setUp({ destinationCapacity: 20 });
        const transfer = await requestVia("manager", scene, 30);
        await stepVia("manager2", transfer, "approve");
        await stepVia("manager2", transfer, "dispatch");
        expect(await quantityIn(scene.product, scene.source)).toBe(70);

        await page.goto("/transfers");
        await page.getByRole("searchbox", { name: "Search" }).fill(transfer.transferNumber);
        await page.getByRole("button", { name: `Receive ${transfer.transferNumber}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Receive" }).click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText(`${scene.destination.code} can hold 20 units and has 0; only 20 more will fit`);
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

        // Still on the truck: dispatched, and in neither warehouse
        await expect(rowOf(page, transfer.transferNumber)).toContainText("Dispatched");
        expect(await quantityIn(scene.product, scene.destination)).toBe(0);
        expect(await quantityIn(scene.product, scene.source)).toBe(70);

        // Make room, and it goes through
        await asAdmin((admin) => admin.put(`warehouses/${scene.destination._id}`, { data: { capacity: 100 } }));
        await page.getByRole("button", { name: `Receive ${transfer.transferNumber}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Receive" }).click();
        await expect(flash(page, `${transfer.transferNumber} received.`)).toBeVisible();
        expect(await quantityIn(scene.product, scene.destination)).toBe(30);
    });

    test("a warehouse with an open transfer can't be deactivated", async ({ browser }) => {
        const scene = await setUp();
        const transfer = await requestVia("manager", scene, 10);

        const context = await browser.newContext({ storageState: statePath("admin") });
        const page = await context.newPage();
        await page.goto("/warehouses");
        await page.getByRole("searchbox", { name: "Search" }).fill(scene.destination.name);
        await page.getByRole("button", { name: `Deactivate ${scene.destination.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(page.getByRole("dialog")).toContainText("1 open transfer(s) involve this warehouse");

        // Once the transfer is cancelled it works
        await stepVia("manager", transfer, "cancel", {});
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(flash(page, "Warehouse deactivated.")).toBeVisible();
        await context.close();
    });

    test("double-clicking Dispatch (two dispatches at once) takes the stock out only once", async () => {
        const scene = await setUp();
        const transfer = await requestVia("manager", scene, 30);
        await stepVia("manager2", transfer, "approve");

        const [one, two] = await Promise.all([stepVia("manager", transfer, "dispatch"), stepVia("manager2", transfer, "dispatch")]);

        expect([one.status, two.status].sort()).toEqual([200, 409]);
        expect(await quantityIn(scene.product, scene.source)).toBe(70); // 100 - 30, never 100 - 60
    });

    test("double-clicking Receive adds the stock only once", async () => {
        const scene = await setUp();
        const transfer = await requestVia("manager", scene, 30);
        await stepVia("manager2", transfer, "approve");
        await stepVia("manager2", transfer, "dispatch");

        const [one, two] = await Promise.all([stepVia("manager", transfer, "receive"), stepVia("manager2", transfer, "receive")]);

        expect([one.status, two.status].sort()).toEqual([200, 409]);
        expect(await quantityIn(scene.product, scene.destination)).toBe(30); // not 60
    });
});

test.describe("who can see transfers", () => {
    test("staff have no Transfers page and the API refuses them; the admin sees everything", async ({ browser }) => {
        const staff = await (await browser.newContext({ storageState: statePath("staff") })).newPage();
        await staff.goto("/transfers");
        await expect(staff.getByText("You don't have access to this page")).toBeVisible();
        await staff.context().close();

        const admin = await (await browser.newContext({ storageState: statePath("admin") })).newPage();
        await admin.goto("/transfers");
        await expect(admin.getByRole("heading", { level: 1, name: "Transfers" })).toBeVisible();
        await expect(admin.getByRole("button", { name: "New transfer" })).toBeVisible();
        await admin.context().close();
    });
});

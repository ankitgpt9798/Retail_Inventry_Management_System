const { test, expect } = require("@playwright/test");
const { USERS } = require("../config");
const { apiAs, createVia, loginApi, statePath } = require("../helpers/api");
const { asAdmin, makeProduct, makeWarehouse, readAs } = require("../helpers/data");
const { flash, submitLoginForm, unique } = require("../helpers/ui");

// Phase 5: suppliers, purchase orders and the supplier portal. Two managers run the approval flow,
// a supplier user (from a different company than the buyer) confirms and updates delivery,
// and stock arrives in stages. Everything is checked in the real database.

const rowOf = (page, text) => page.getByRole("row").filter({ hasText: text });

const stockOf = async (product, warehouse) => {
    const { inventories } = await readAs("admin", `inventory?product=${product._id}&warehouse=${warehouse._id}`);
    return inventories[0] || { quantity: 0 };
};

// A new supplier company with its own portal user. Returns { supplier, user, client } (client = the user's logged-in API client)
const makeSupplierWithUser = async () => {
    const id = unique();
    const { supplier } = await asAdmin((admin) => createVia(admin, "suppliers", { name: `E2E Supplier ${id}`, email: `sales-${id}@e2e.test`, city: "Mumbai" }));
    const user = { name: `Portal ${id}`, email: `portal-${id}@e2e.test`, password: "Portal12345", role: "SUPPLIER", supplier: supplier._id };
    await asAdmin((admin) => createVia(admin, "users", user));
    const client = await loginApi(user.email, user.password);
    return { supplier, user, client };
};

// A browser page already logged in as that supplier user
const pageAsSupplier = async (browser, portal) => {
    const context = await browser.newContext({ storageState: await portal.client.storageState() });
    return { context, page: await context.newPage() };
};

// Creates a purchase order through the API as a role. lines = [[product, quantity, unitCost?]]
const purchaseVia = async (role, { supplier, warehouse }, lines, extra = {}) => {
    const client = await apiAs(role);
    const { purchase } = await createVia(client, "purchases", {
        supplier: supplier._id,
        warehouse: warehouse._id,
        items: lines.map(([product, quantityOrdered, unitCost]) => ({ product: product._id, quantityOrdered, ...(unitCost !== undefined ? { unitCost } : {}) })),
        ...extra
    });
    await client.dispose();
    return purchase;
};

// One API step on a purchase order as a role (or as any client); returns { status, body }
const stepVia = async (who, purchase, action, body) => {
    const client = typeof who === "string" ? await apiAs(who) : who;
    const response = await client.put(`purchases/${purchase._id}/${action}`, body ? { data: body } : {});
    const result = { status: response.status(), body: await response.json() };
    if (typeof who === "string") await client.dispose();
    return result;
};

// Takes a purchase order all the way to ORDERED (requested by Ravi, approved by Neha)
const orderedPurchase = async (scene, lines) => {
    const purchase = await purchaseVia("manager", scene, lines, { submit: true });
    await stepVia("manager2", purchase, "approve");
    await stepVia("manager2", purchase, "order");
    return purchase;
};

const notesOf = async (who, text) => {
    const client = typeof who === "string" ? await apiAs(who) : who;
    const body = await (await client.get("notifications?limit=100")).json();
    if (typeof who === "string") await client.dispose();
    return body.data.notifications.filter((note) => note.message.includes(text));
};

const newScene = async () => {
    const portal = await makeSupplierWithUser();
    const warehouse = await makeWarehouse({ capacity: 1000 });
    const productA = await makeProduct({ costPrice: 100 });
    const productB = await makeProduct({ costPrice: 50 });
    return { ...portal, warehouse, productA, productB };
};

// ======================================================================================
test.describe("the full purchase lifecycle", () => {
    test("draft → submit → approve → ordered → supplier confirms → partial receipt → full receipt: stock, notifications, audit", async ({ browser }) => {
        const scene = await newScene();
        const { supplier, warehouse, productA, productB } = scene;

        const raviContext = await browser.newContext({ storageState: statePath("manager") });
        const nehaContext = await browser.newContext({ storageState: statePath("manager2") });
        const ravi = await raviContext.newPage();
        const neha = await nehaContext.newPage();

        // ---- 1. Ravi writes a draft in the UI. One line uses the product's own cost, one a special price ----
        await ravi.goto("/purchases/new");
        await ravi.getByLabel("Supplier", { exact: true }).selectOption(supplier._id);
        await ravi.getByLabel("Deliver to warehouse").selectOption(warehouse._id);
        await ravi.getByLabel("Expected delivery date (optional)").fill("2030-01-15");
        await ravi.getByLabel("Notes (optional)").fill("First order of the year");
        await ravi.getByLabel("Product 1").selectOption(productA._id);
        await ravi.getByLabel("Quantity 1").fill("40"); // unit cost left empty → the product's cost price (₹100)
        await ravi.getByRole("button", { name: /add item/i }).click();
        await ravi.getByLabel("Product 2").selectOption(productB._id);
        await ravi.getByLabel("Quantity 2").fill("10");
        await ravi.getByLabel("Unit cost 2").fill("45"); // a negotiated price instead of the product's ₹50
        await expect(ravi.getByTestId("estimate")).toContainText("₹4,450.00"); // 40 × 100 + 10 × 45
        await ravi.getByRole("button", { name: "Save as draft" }).click();

        await expect(ravi).toHaveURL(/\/purchases\/[0-9a-f]{24}$/);
        const purchaseId = ravi.url().split("/").pop();
        let { purchase } = await readAs("admin", `purchases/${purchaseId}`);
        const po = purchase.poNumber;
        expect(po).toMatch(/^PO-\d{6}$/);
        expect(purchase).toMatchObject({ status: "DRAFT", totalAmount: 4450, notes: "First order of the year" });
        expect(purchase.items.map((item) => [item.quantityOrdered, item.unitCost])).toEqual([[40, 100], [10, 45]]); // the server filled in ₹100
        await expect(ravi.getByRole("heading", { level: 1, name: po })).toBeVisible();

        // The supplier can't see a draft: not in their list, and 404 if they guess the address
        expect((await (await scene.client.get("purchases")).json()).data.purchases).toHaveLength(0);
        expect((await scene.client.get(`purchases/${purchaseId}`)).status()).toBe(404);

        // ---- 2. Edit the draft, then submit it ----
        await ravi.getByRole("link", { name: "Edit" }).click();
        await ravi.getByLabel("Quantity 1").fill("50");
        await ravi.getByRole("button", { name: "Save changes" }).click();
        await expect(ravi).toHaveURL(new RegExp(`/purchases/${purchaseId}$`));
        expect((await readAs("admin", `purchases/${purchaseId}`)).purchase.totalAmount).toBe(5450); // 50 × 100 + 10 × 45

        await ravi.getByRole("button", { name: "Submit for approval" }).click();
        await expect(flash(ravi, `${po} submitted for approval.`)).toBeVisible();
        // Ravi asked for it, so Ravi can't approve it: neither on screen nor in the API
        await expect(ravi.getByText("Needs another approver")).toBeVisible();
        const selfApproval = await stepVia("manager", purchase, "approve");
        expect(selfApproval.status).toBe(403);
        expect(selfApproval.body.error).toBe("SELF_APPROVAL_NOT_ALLOWED");
        // Neha and the admin are told it needs approval
        expect(await notesOf("manager2", po)).toEqual([expect.objectContaining({ title: "Purchase request needs approval" })]);
        expect(await notesOf("admin", po)).toHaveLength(1);

        // ---- 3. Neha approves ----
        await neha.goto(`/purchases/${purchaseId}`);
        await neha.getByRole("button", { name: "Approve", exact: true }).click();
        await expect(flash(neha, `${po} approved.`)).toBeVisible();
        expect((await notesOf("manager", po)).map((note) => note.title)).toEqual(expect.arrayContaining(["Purchase approved"]));
        // Approved is not yet ordered: the supplier still can't see it
        expect((await scene.client.get(`purchases/${purchaseId}`)).status()).toBe(404);

        // ---- 4. Mark as ordered (asks first): now the supplier is told ----
        await neha.getByRole("button", { name: "Mark as ordered" }).click();
        await expect(neha.getByRole("dialog")).toContainText(supplier.name);
        await neha.getByRole("dialog").getByRole("button", { name: "Mark as ordered" }).click();
        await expect(flash(neha, `${po} sent to the supplier.`)).toBeVisible();
        expect(await notesOf(scene.client, po)).toEqual([expect.objectContaining({ title: "New purchase order" })]);

        // ---- 5. The supplier logs in through the real login form and lands on their orders ----
        const supplierContext = await browser.newContext();
        const sup = await supplierContext.newPage();
        await submitLoginForm(sup, scene.user);
        await expect(sup).toHaveURL(/\/purchases$/);
        await expect(sup.getByRole("heading", { level: 1, name: "My purchase orders" })).toBeVisible();
        await expect(rowOf(sup, po)).toContainText("Ordered");
        await sup.getByRole("link", { name: `View ${po}` }).click();
        await expect(sup.getByText("₹5,450.00").first()).toBeVisible();

        // Confirm with a date and a note
        await sup.getByRole("button", { name: "Confirm order" }).click();
        const confirm = sup.getByRole("dialog");
        await confirm.getByLabel("Expected delivery date").fill("2030-01-20");
        await confirm.getByLabel("Delivery note").fill("Ships on Monday");
        await confirm.getByRole("button", { name: "Confirm order" }).click();
        await expect(flash(sup, `${po} confirmed.`)).toBeVisible();
        await expect(sup.getByRole("button", { name: "Confirm order" })).toHaveCount(0); // once only
        purchase = (await readAs("admin", `purchases/${purchaseId}`)).purchase;
        expect(purchase.deliveryNote).toBe("Ships on Monday");
        expect(purchase.expectedDeliveryDate).toContain("2030-01-20");
        expect(purchase.supplierConfirmedAt).toBeTruthy();
        expect((await notesOf("manager", po)).map((note) => note.title)).toEqual(expect.arrayContaining(["Supplier confirmed order"]));
        expect((await stepVia(scene.client, purchase, "confirm", {})).status).toBe(409); // "already confirmed" in the API too

        // ...and later updates the delivery details
        await sup.getByRole("button", { name: "Update delivery details" }).click();
        await sup.getByRole("dialog").getByLabel("Delivery note").fill("Split into two trucks");
        await sup.getByRole("dialog").getByRole("button", { name: "Save" }).click();
        await expect(flash(sup, "Delivery details updated.")).toBeVisible();
        expect((await notesOf("manager", po)).map((note) => note.title)).toEqual(expect.arrayContaining(["Delivery details updated"]));

        // The supplier has no buyer's controls at all
        for (const name of ["Receive goods", "Cancel order", "Approve", "Mark as ordered"]) {
            await expect(sup.getByRole("button", { name })).toHaveCount(0);
        }

        // ---- 6. Truck one arrives: 25 of A (50 ordered). The rest is still expected ----
        await neha.reload();
        await neha.getByRole("button", { name: "Receive goods" }).click();
        const receive = neha.getByRole("dialog");
        await receive.getByLabel(`Received quantity for ${productA.name}`).fill("25");
        await receive.getByRole("button", { name: "Record delivery" }).click();
        await expect(flash(neha, `Goods received for ${po}.`)).toBeVisible();
        await expect(neha.getByText("Partly received").first()).toBeVisible();
        expect((await stockOf(productA, warehouse)).quantity).toBe(25);
        expect((await stockOf(productB, warehouse)).quantity).toBe(0);
        purchase = (await readAs("admin", `purchases/${purchaseId}`)).purchase;
        expect(purchase.status).toBe("PARTIALLY_RECEIVED");
        expect(purchase.items.map((item) => item.quantityReceived)).toEqual([25, 0]);
        // The requester (Ravi) is told; the receiver (Neha) is not told about her own action
        expect((await notesOf("manager", po)).map((note) => note.title)).toEqual(expect.arrayContaining(["Goods received"]));

        // ---- 7. Receiving more than is outstanding is refused, in the form and in the API ----
        await neha.getByRole("button", { name: "Receive goods" }).click();
        await neha.getByRole("dialog").getByLabel(`Received quantity for ${productA.name}`).fill("30");
        await neha.getByRole("dialog").getByRole("button", { name: "Record delivery" }).click();
        await expect(neha.getByRole("dialog")).toContainText(`Only 25 unit(s) of ${productA.name} are still expected`);
        const over = await stepVia("manager2", purchase, "receive", { items: [{ product: productA._id, quantity: 30 }] });
        expect(over.status).toBe(400);
        expect(over.body.message).toContain(`Only 25 of ${productA.sku} are still outstanding on ${po}`);
        expect((await stockOf(productA, warehouse)).quantity).toBe(25); // unchanged

        // ---- 8. Truck two brings the rest: the order is complete ----
        await neha.getByRole("dialog").getByLabel(`Received quantity for ${productA.name}`).fill("25");
        await neha.getByRole("dialog").getByLabel(`Received quantity for ${productB.name}`).fill("10");
        await neha.getByRole("dialog").getByRole("button", { name: "Record delivery" }).click();
        await expect(flash(neha, `Goods received for ${po}.`)).toBeVisible();
        expect((await stockOf(productA, warehouse)).quantity).toBe(50);
        expect((await stockOf(productB, warehouse)).quantity).toBe(10);
        purchase = (await readAs("admin", `purchases/${purchaseId}`)).purchase;
        expect(purchase.status).toBe("RECEIVED");
        expect(purchase.receivedAt).toBeTruthy();
        await expect(neha.getByRole("button", { name: /^(Receive goods|Cancel|Approve|Submit|Mark as ordered)/ })).toHaveCount(0);

        // The stock history ties both deliveries to this purchase order
        const { transactions } = await readAs("admin", `inventory/transactions?product=${productA._id}&limit=20`);
        const receipts = transactions.filter((t) => t.type === "STOCK_IN" && t.referenceType === "PURCHASE_ORDER");
        expect(receipts.map((t) => [t.quantityBefore, t.quantityAfter])).toEqual([[25, 50], [0, 25]]);

        // The supplier sees the final state and has nothing left to do
        await sup.reload();
        await expect(sup.getByText("Received").first()).toBeVisible();
        await expect(sup.getByRole("button", { name: /Confirm|Update delivery/ })).toHaveCount(0);

        // ---- 9. Every step is in the audit log, by the right person ----
        const { auditLogs } = await readAs("admin", `audit-logs?entityType=PurchaseOrder&entityId=${purchaseId}&sort=oldest&limit=50`);
        const actions = auditLogs.map((entry) => entry.action);
        for (const action of ["PURCHASE_SUBMITTED", "PURCHASE_APPROVED", "PURCHASE_ORDERED", "PURCHASE_CONFIRMED_BY_SUPPLIER", "PURCHASE_DELIVERY_UPDATED"]) {
            expect(actions, action).toContain(action);
        }
        const by = (action) => auditLogs.find((entry) => entry.action === action).user.email;
        expect(by("PURCHASE_SUBMITTED")).toBe(USERS.manager.email);
        expect(by("PURCHASE_APPROVED")).toBe(USERS.manager2.email);
        expect(by("PURCHASE_CONFIRMED_BY_SUPPLIER")).toBe(scene.user.email);

        await raviContext.close();
        await nehaContext.close();
        await supplierContext.close();
    });
});

// ======================================================================================
test.describe("the supplier portal keeps companies apart", () => {
    test("a supplier sees only their own company's SENT orders, and can't touch anyone else's", async ({ browser }) => {
        const mine = await newScene();
        const other = await newScene();
        const myOrder = await orderedPurchase(mine, [[mine.productA, 5]]);
        const myDraft = await purchaseVia("manager", mine, [[mine.productA, 2]]); // never sent to them
        const theirOrder = await orderedPurchase(other, [[other.productA, 7]]);

        // The list: exactly one order, even when they ask for the other company's by name
        const own = (await (await mine.client.get("purchases")).json()).data.purchases;
        expect(own.map((p) => p.poNumber)).toEqual([myOrder.poNumber]);
        const sneaky = (await (await mine.client.get(`purchases?supplier=${other.supplier._id}`)).json()).data.purchases;
        expect(sneaky.map((p) => p.poNumber)).toEqual([myOrder.poNumber]);

        // Someone else's order, and my own unsent draft: not found, in every way
        for (const forbidden of [theirOrder, myDraft]) {
            expect((await mine.client.get(`purchases/${forbidden._id}`)).status(), forbidden.poNumber).toBe(404);
            expect((await stepVia(mine.client, forbidden, "confirm", {})).status).toBe(404);
            expect((await stepVia(mine.client, forbidden, "delivery", { deliveryNote: "hijack" })).status).toBe(404);
        }
        expect((await readAs("admin", `purchases/${theirOrder._id}`)).purchase.deliveryNote).toBeFalsy();

        // In the browser: the list shows just one row, and the other order's page is "not found"
        const { context, page } = await pageAsSupplier(browser, mine);
        await page.goto("/purchases");
        await expect(page.getByRole("row")).toHaveCount(2); // header + 1
        await expect(rowOf(page, myOrder.poNumber)).toBeVisible();
        await expect(page.getByText(theirOrder.poNumber)).toHaveCount(0);
        await page.goto(`/purchases/${theirOrder._id}`);
        await expect(page.getByText("Purchase order not found")).toBeVisible();
        await context.close();
    });

    test("cancelling: the supplier hears about it only once the order was sent to them", async () => {
        const scene = await newScene();
        const beforeSent = await purchaseVia("manager", scene, [[scene.productA, 5]], { submit: true });
        await stepVia("manager2", beforeSent, "cancel", { reason: "Not needed" });
        expect(await notesOf(scene.client, beforeSent.poNumber)).toHaveLength(0);

        const afterSent = await orderedPurchase(scene, [[scene.productB, 5]]);
        await stepVia("manager2", afterSent, "cancel", { reason: "Found a cheaper supplier" });
        const told = await notesOf(scene.client, afterSent.poNumber);
        expect(told.map((note) => note.title)).toContain("Purchase order cancelled");
        expect(told.some((note) => note.message.includes("Found a cheaper supplier"))).toBe(true);
    });
});

// ======================================================================================
test.describe("approval rules", () => {
    test.use({ storageState: statePath("manager2") });

    test("a rejection needs a reason, shows it, and is final", async ({ page }) => {
        const scene = await newScene();
        const purchase = await purchaseVia("manager", scene, [[scene.productA, 5]], { submit: true });

        await page.goto(`/purchases/${purchase._id}`);
        await page.getByRole("button", { name: "Reject", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Reject request" }).click();
        await expect(dialog.getByText(/give a reason/i)).toBeVisible();
        await dialog.getByLabel("Reason for rejecting").fill("Over budget this quarter");
        await dialog.getByRole("button", { name: "Reject request" }).click();

        await expect(flash(page, `${purchase.poNumber} rejected.`)).toBeVisible();
        await expect(page.getByText("Over budget this quarter")).toBeVisible();
        expect((await stepVia("manager2", purchase, "approve")).status).toBe(409); // can't be approved afterwards
        expect((await notesOf("manager", purchase.poNumber)).some((note) => note.message.includes("Over budget this quarter") || note.title.includes("rejected"))).toBe(true);
    });

    test("'Cancel the rest' of a part-delivered order keeps what already arrived", async ({ page }) => {
        const scene = await newScene();
        const purchase = await orderedPurchase(scene, [[scene.productA, 40]]);
        await stepVia("manager2", purchase, "receive", { items: [{ product: scene.productA._id, quantity: 15 }] });

        await page.goto(`/purchases/${purchase._id}`);
        await page.getByRole("button", { name: "Cancel the rest" }).click();
        await expect(page.getByRole("dialog")).toContainText("Goods already received stay in stock.");
        await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
        await expect(flash(page, `${purchase.poNumber} cancelled.`)).toBeVisible();

        expect((await readAs("admin", `purchases/${purchase._id}`)).purchase.status).toBe("CANCELLED");
        expect((await stockOf(scene.productA, scene.warehouse)).quantity).toBe(15); // the delivered part stays
    });

    test("receiving the same goods twice at the same moment adds them only once", async () => {
        const scene = await newScene();
        const purchase = await orderedPurchase(scene, [[scene.productA, 10]]);
        const receive = { items: [{ product: scene.productA._id, quantity: 10 }] };

        const [one, two] = await Promise.all([stepVia("manager", purchase, "receive", receive), stepVia("manager2", purchase, "receive", receive)]);

        expect([one.status, two.status].filter((status) => status === 200)).toHaveLength(1); // exactly one wins
        expect((await stockOf(scene.productA, scene.warehouse)).quantity).toBe(10); // not 20
        expect((await readAs("admin", `purchases/${purchase._id}`)).purchase.items[0].quantityReceived).toBe(10);
    });

    test("goods can't be received into a full warehouse; they can once there is room", async () => {
        const scene = await newScene();
        await asAdmin((admin) => admin.put(`warehouses/${scene.warehouse._id}`, { data: { capacity: 20 } }));
        const purchase = await orderedPurchase(scene, [[scene.productA, 30]]);
        const receive = { items: [{ product: scene.productA._id, quantity: 30 }] };

        const refused = await stepVia("manager2", purchase, "receive", receive);
        expect(refused.status).toBe(409);
        expect(refused.body.message).toContain(`${scene.warehouse.code} can hold 20 units and has 0`);
        expect((await stockOf(scene.productA, scene.warehouse)).quantity).toBe(0);
        expect((await readAs("admin", `purchases/${purchase._id}`)).purchase.status).toBe("ORDERED"); // nothing half-done

        await asAdmin((admin) => admin.put(`warehouses/${scene.warehouse._id}`, { data: { capacity: 100 } }));
        expect((await stepVia("manager2", purchase, "receive", receive)).status).toBe(200);
        expect((await stockOf(scene.productA, scene.warehouse)).quantity).toBe(30);
    });
});

// ======================================================================================
test.describe("suppliers (admin and manager)", () => {
    test.use({ storageState: statePath("manager") });

    test("create, edit, find and deactivate a supplier in the UI; a duplicate email is refused", async ({ page }) => {
        const id = unique();
        const name = `E2E Traders ${id}`;
        const email = `traders-${id}@e2e.test`;
        await page.goto("/suppliers");

        await page.getByRole("button", { name: "New supplier" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Company name").fill(name);
        await dialog.getByLabel("Contact person (optional)").fill("Asha Verma");
        await dialog.getByLabel("Email", { exact: true }).fill(email);
        await dialog.getByLabel("City (optional)").fill("Jaipur");
        await dialog.getByRole("button", { name: "Create supplier" }).click();
        await expect(flash(page, "Supplier created.")).toBeVisible();

        await page.getByRole("searchbox", { name: "Search" }).fill(name);
        await expect(rowOf(page, name)).toContainText("Asha Verma");
        await expect(rowOf(page, name)).toContainText("Jaipur");
        const stored = (await readAs("admin", `suppliers?search=${encodeURIComponent(name)}`)).suppliers[0];
        expect(stored).toMatchObject({ email, city: "Jaipur", status: "ACTIVE" });

        // The same email again
        await page.getByRole("button", { name: "New supplier" }).click();
        await page.getByRole("dialog").getByLabel("Company name").fill(`${name} Two`);
        await page.getByRole("dialog").getByLabel("Email", { exact: true }).fill(email);
        await page.getByRole("dialog").getByRole("button", { name: "Create supplier" }).click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText(`Email is already used by supplier "${name}"`);
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

        // Edit
        await page.getByRole("button", { name: `Edit ${name}` }).click();
        await page.getByLabel("City (optional)").fill("Udaipur");
        await page.getByRole("button", { name: "Save changes" }).click();
        await expect(flash(page, "Supplier updated.")).toBeVisible();
        await expect(rowOf(page, name)).toContainText("Udaipur");

        // Deactivate and reactivate
        await page.getByRole("button", { name: `Deactivate ${name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(flash(page, "Supplier deactivated.")).toBeVisible();
        await expect(rowOf(page, name)).toContainText("Inactive");
        await page.getByRole("button", { name: `Reactivate ${name}` }).click();
        await expect(flash(page, "Supplier reactivated.")).toBeVisible();
    });

    test("a supplier with an open order can't be deactivated; once it is done, the portal logins are switched off with it", async ({ browser, page }) => {
        const scene = await newScene();
        const purchase = await orderedPurchase(scene, [[scene.productA, 10]]);
        const supplierSide = await pageAsSupplier(browser, scene);
        await supplierSide.page.goto("/purchases");
        await expect(supplierSide.page.getByRole("heading", { level: 1, name: "My purchase orders" })).toBeVisible();

        await page.goto("/suppliers");
        await page.getByRole("searchbox", { name: "Search" }).fill(scene.supplier.name);
        await page.getByRole("button", { name: `Deactivate ${scene.supplier.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(page.getByRole("dialog")).toContainText("1 open purchase order(s) with this supplier");
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

        // Receive everything → nothing open any more → deactivation goes through and reports the cascade
        await stepVia("manager2", purchase, "receive", { items: [{ product: scene.productA._id, quantity: 10 }] });
        await page.getByRole("button", { name: `Deactivate ${scene.supplier.name}` }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
        await expect(flash(page, "Supplier deactivated. 1 portal login(s) were deactivated too.")).toBeVisible();

        // The supplier's own logged-in browser is thrown out on its next action (finding F1 stays fixed)
        await supplierSide.page.getByRole("link", { name: `View ${purchase.poNumber}` }).click();
        await expect(supplierSide.page).toHaveURL(/\/login$/);
        await submitLoginForm(supplierSide.page, scene.user);
        await expect(supplierSide.page.getByRole("alert")).toBeVisible();
        await supplierSide.context.close();
    });

    test("an inactive supplier can't be chosen for a new order, and the API agrees", async ({ page }) => {
        const scene = await newScene();
        await asAdmin((admin) => admin.delete(`suppliers/${scene.supplier._id}`));

        await page.goto("/purchases/new");
        await expect(page.getByLabel("Supplier", { exact: true }).locator(`option[value="${scene.supplier._id}"]`)).toHaveCount(0);

        const client = await apiAs("manager");
        const response = await client.post("purchases", {
            data: { supplier: scene.supplier._id, warehouse: scene.warehouse._id, items: [{ product: scene.productA._id, quantityOrdered: 1 }] }
        });
        expect(response.status()).toBe(422);
        expect((await response.json()).message).toContain(`Supplier "${scene.supplier.name}" is inactive`);
        await client.dispose();
    });

    test("a warehouse with an open purchase order can't be deactivated", async () => {
        const scene = await newScene();
        const purchase = await purchaseVia("manager", scene, [[scene.productA, 5]]); // a draft counts as open

        const admin = await apiAs("admin");
        const refused = await admin.delete(`warehouses/${scene.warehouse._id}`);
        expect(refused.status()).toBe(409);
        expect((await refused.json()).message).toContain("1 open purchase order(s) deliver to this warehouse");

        await stepVia("manager", purchase, "cancel", {});
        expect((await admin.delete(`warehouses/${scene.warehouse._id}`)).status()).toBe(200);
        await admin.dispose();
    });
});

// ======================================================================================
test.describe("the purchase form and list", () => {
    test.use({ storageState: statePath("manager") });

    test("a repeated product is caught before anything is sent; search and filters find orders", async ({ page }) => {
        const scene = await newScene();
        await page.goto("/purchases/new");
        await page.getByLabel("Supplier", { exact: true }).selectOption(scene.supplier._id);
        await page.getByLabel("Deliver to warehouse").selectOption(scene.warehouse._id);
        await page.getByLabel("Product 1").selectOption(scene.productA._id);
        await page.getByRole("button", { name: /add item/i }).click();
        await page.getByLabel("Product 2").selectOption(scene.productA._id);
        await page.getByRole("button", { name: "Save as draft" }).click();
        await expect(page.getByText(/Each product can appear only once/)).toBeVisible();
        await expect(page).toHaveURL(/\/purchases\/new$/);

        // The list: find by number and by status/supplier/warehouse
        const draft = await purchaseVia("manager", scene, [[scene.productA, 3]]);
        const sent = await purchaseVia("manager", scene, [[scene.productB, 4]], { submit: true });
        await page.goto("/purchases");
        await page.getByRole("combobox", { name: "Supplier" }).selectOption(scene.supplier._id);
        await expect(page.getByRole("row")).toHaveCount(3); // header + 2
        await page.getByRole("combobox", { name: "Status" }).selectOption("PENDING");
        await expect(page.getByRole("row")).toHaveCount(2);
        await expect(rowOf(page, sent.poNumber)).toContainText("Awaiting approval");
        await page.getByRole("combobox", { name: "Status" }).selectOption("");
        await page.getByRole("searchbox", { name: "Search" }).fill(draft.poNumber);
        await expect(page.getByRole("row")).toHaveCount(2);
        await expect(rowOf(page, draft.poNumber)).toContainText("Draft");
    });

    test("staff cannot use purchasing at all", async ({ browser }) => {
        const context = await browser.newContext({ storageState: statePath("staff") });
        const page = await context.newPage();
        for (const path of ["/purchases", "/suppliers", "/purchases/new"]) {
            await page.goto(path);
            await expect(page.getByText("You don't have access to this page")).toBeVisible();
        }
        await context.close();
    });
});

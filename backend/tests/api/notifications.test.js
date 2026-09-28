const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Warehouse = require("../../src/models/Warehouse");
const Inventory = require("../../src/models/Inventory");
const Notification = require("../../src/models/Notification");
const { ROLES } = require("../../src/utils/constants");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");
const { createTestUser, loginAgent } = require("../helpers/userHelpers");

let ravi;
let meena;
let raviAgent;
let meenaAgent;

beforeAll(async () => {
    await connectTestDB();
    await Promise.all([User.init(), Notification.init()]);
}, 20000);

beforeEach(async () => {
    await clearTestDB();
    ravi = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "ravi@shop.com", name: "Ravi" });
    meena = await createTestUser({ role: ROLES.INVENTORY_MANAGER, email: "meena@shop.com", name: "Meena" });
    raviAgent = await loginAgent("ravi@shop.com");
    meenaAgent = await loginAgent("meena@shop.com");
});

afterAll(async () => {
    await closeTestDB();
});

// Creates notifications with increasing createdAt, so "newest first" is predictable
const addNotifications = async (recipient, list) => {
    const base = Date.now() - 60000;
    return Notification.insertMany(list.map((item, index) => ({
        recipient: recipient._id,
        type: item.type || "SYSTEM_ALERT",
        title: item.title,
        message: `${item.title} message`,
        isRead: item.isRead || false,
        createdAt: new Date(base + index * 1000)
    })));
};

describe("Access", () => {
    test("not logged in → 401 on every endpoint", async () => {
        expect((await request(app).get("/api/notifications")).status).toBe(401);
        expect((await request(app).get("/api/notifications/unread-count")).status).toBe(401);
        expect((await request(app).put("/api/notifications/read-all")).status).toBe(401);
    });

    test("every role can use it — including SUPPLIER and STAFF", async () => {
        await createTestUser({ role: ROLES.SUPPLIER, email: "supplier@x.in" });
        await createTestUser({ role: ROLES.STAFF, email: "staff@shop.com" });

        expect((await (await loginAgent("supplier@x.in")).get("/api/notifications")).status).toBe(200);
        expect((await (await loginAgent("staff@shop.com")).get("/api/notifications/unread-count")).status).toBe(200);
    });
});

describe("GET /api/notifications", () => {
    beforeEach(async () => {
        await addNotifications(ravi, [
            { title: "Oldest", type: "LOW_STOCK", isRead: true },
            { title: "Middle", type: "STOCK_TRANSFER" },
            { title: "Newest", type: "LOW_STOCK" }
        ]);
        await addNotifications(meena, [{ title: "For Meena" }]);
    });

    const titles = (response) => response.body.data.notifications.map((n) => n.title);

    test("only MY notifications, newest first, with unreadCount", async () => {
        const response = await raviAgent.get("/api/notifications");

        expect(response.status).toBe(200);
        expect(titles(response)).toEqual(["Newest", "Middle", "Oldest"]);
        expect(response.body.data.unreadCount).toBe(2);
        expect(response.body.data.pagination).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
    });

    test("filter isRead=false / isRead=true", async () => {
        expect(titles(await raviAgent.get("/api/notifications?isRead=false"))).toEqual(["Newest", "Middle"]);
        expect(titles(await raviAgent.get("/api/notifications?isRead=true"))).toEqual(["Oldest"]);
    });

    test("filter by type", async () => {
        expect(titles(await raviAgent.get("/api/notifications?type=LOW_STOCK"))).toEqual(["Newest", "Oldest"]);
    });

    test("pagination", async () => {
        const page2 = await raviAgent.get("/api/notifications?limit=2&page=2");

        expect(titles(page2)).toEqual(["Oldest"]);
        expect(page2.body.data.pagination.totalPages).toBe(2);
        // unreadCount is for the whole inbox, not just this page
        expect(page2.body.data.unreadCount).toBe(2);
    });

    test("invalid filters → 422", async () => {
        const badFlag = await raviAgent.get("/api/notifications?isRead=yes");
        const badType = await raviAgent.get("/api/notifications?type=SPAM");

        expect(badFlag.status).toBe(422);
        expect(badFlag.body.message).toBe("isRead must be true or false");
        expect(badType.body.message).toBe("Notification type is not valid");
    });
});

describe("GET /api/notifications/unread-count", () => {
    test("counts only my unread notifications", async () => {
        await addNotifications(ravi, [{ title: "A" }, { title: "B" }, { title: "C", isRead: true }]);
        await addNotifications(meena, [{ title: "D" }]);

        const response = await raviAgent.get("/api/notifications/unread-count");

        expect(response.body.data).toEqual({ unreadCount: 2 });
    });
});

describe("PUT /api/notifications/:id/read", () => {
    test("marks it read with a readAt time; unread count goes down", async () => {
        const [notification] = await addNotifications(ravi, [{ title: "A" }]);

        const response = await raviAgent.put(`/api/notifications/${notification._id}/read`);
        const count = await raviAgent.get("/api/notifications/unread-count");

        expect(response.status).toBe(200);
        expect(response.body.data.notification.isRead).toBe(true);
        expect(response.body.data.notification.readAt).toBeDefined();
        expect(count.body.data.unreadCount).toBe(0);
    });

    test("marking twice is fine and keeps the first readAt (idempotent)", async () => {
        const [notification] = await addNotifications(ravi, [{ title: "A" }]);

        const first = await raviAgent.put(`/api/notifications/${notification._id}/read`);
        const second = await raviAgent.put(`/api/notifications/${notification._id}/read`);

        expect(second.status).toBe(200);
        expect(second.body.data.notification.readAt).toBe(first.body.data.notification.readAt);
    });

    test("malformed id → 400", async () => {
        const response = await raviAgent.put("/api/notifications/not-an-id/read");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("INVALID_ID");
    });

    test("unknown id → 404", async () => {
        const response = await raviAgent.put("/api/notifications/000000000000000000000000/read");

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("NOTIFICATION_NOT_FOUND");
    });
});

describe("PUT /api/notifications/read-all", () => {
    test("marks all MY unread notifications and reports how many", async () => {
        await addNotifications(ravi, [{ title: "A" }, { title: "B" }, { title: "C", isRead: true }]);

        const response = await raviAgent.put("/api/notifications/read-all");

        expect(response.body.message).toBe("2 notification(s) marked as read");
        expect(response.body.data.updatedCount).toBe(2);
        expect(await Notification.countDocuments({ recipient: ravi._id, isRead: false })).toBe(0);
    });

    test("nothing unread → 0, still 200", async () => {
        const response = await raviAgent.put("/api/notifications/read-all");

        expect(response.status).toBe(200);
        expect(response.body.data.updatedCount).toBe(0);
    });
});

describe("DELETE /api/notifications/:id", () => {
    test("deletes my notification for real", async () => {
        const [notification] = await addNotifications(ravi, [{ title: "A" }]);

        const response = await raviAgent.delete(`/api/notifications/${notification._id}`);

        expect(response.status).toBe(200);
        expect(await Notification.countDocuments()).toBe(0);
    });

    test("deleting it again → 404", async () => {
        const [notification] = await addNotifications(ravi, [{ title: "A" }]);
        await raviAgent.delete(`/api/notifications/${notification._id}`);

        expect((await raviAgent.delete(`/api/notifications/${notification._id}`)).status).toBe(404);
    });
});

describe("Privacy: nobody can touch someone else's notifications", () => {
    let meenasNotification;

    beforeEach(async () => {
        [meenasNotification] = await addNotifications(meena, [{ title: "Private to Meena" }]);
    });

    test("Ravi cannot see it in his list", async () => {
        const response = await raviAgent.get("/api/notifications");

        expect(response.body.data.notifications).toHaveLength(0);
    });

    test("Ravi cannot mark it read (404, and it stays unread)", async () => {
        const response = await raviAgent.put(`/api/notifications/${meenasNotification._id}/read`);

        expect(response.status).toBe(404);
        expect((await Notification.findById(meenasNotification._id)).isRead).toBe(false);
    });

    test("Ravi's read-all doesn't touch it", async () => {
        await raviAgent.put("/api/notifications/read-all");

        expect((await Notification.findById(meenasNotification._id)).isRead).toBe(false);
    });

    test("Ravi cannot delete it (404, and it still exists)", async () => {
        const response = await raviAgent.delete(`/api/notifications/${meenasNotification._id}`);

        expect(response.status).toBe(404);
        expect(await Notification.countDocuments({ _id: meenasNotification._id })).toBe(1);
    });

    test("Meena can", async () => {
        expect((await meenaAgent.put(`/api/notifications/${meenasNotification._id}/read`)).status).toBe(200);
    });
});

describe("End to end with a real event", () => {
    test("a stock-out that crosses the reorder level shows up in both managers' inboxes", async () => {
        const category = await Category.create({ name: "Electronics" });
        const keyboard = await Product.create({
            name: "Keyboard K100", sku: "KEY-K100", category: category._id, costPrice: 600, sellingPrice: 899
        });
        const noida = await Warehouse.create({ name: "Noida Hub", code: "NOI-01", city: "Noida", capacity: 1000 });
        await Inventory.create({ product: keyboard._id, warehouse: noida._id, quantity: 25, reorderLevel: 20 });

        await raviAgent.post("/api/inventory/stock-out").send({
            product: keyboard._id.toString(), warehouse: noida._id.toString(), quantity: 8, note: "Damaged"
        });

        const ravisInbox = await raviAgent.get("/api/notifications?type=LOW_STOCK");
        const meenasCount = await meenaAgent.get("/api/notifications/unread-count");

        expect(ravisInbox.body.data.notifications[0]).toMatchObject({
            type: "LOW_STOCK",
            title: "Low stock",
            message: "Keyboard K100 (KEY-K100) is below reorder level in NOI-01: 17 available, reorder level 20.",
            isRead: false
        });
        expect(ravisInbox.body.data.notifications[0].link).toMatch(/^\/inventory\/[0-9a-f]{24}$/);
        expect(meenasCount.body.data.unreadCount).toBe(1);
    });
});

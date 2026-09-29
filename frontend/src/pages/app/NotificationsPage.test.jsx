import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationsPage from "./NotificationsPage";
import api from "../../services/api";
import { NOTIFICATIONS_CHANGED } from "../../hooks/useUnreadCount";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const unread = {
    _id: "n1", type: "LOW_STOCK", title: "Low stock: Keyboard", message: "Keyboard is low in Noida Hub", isRead: false,
    link: "/inventory", createdAt: "2026-09-28T10:00:00.000Z"
};
const read = {
    _id: "n2", type: "NEW_ORDER", title: "New order ORD-000001", message: "Priya placed an order", isRead: true,
    link: "/orders/o1", createdAt: "2026-09-27T10:00:00.000Z"
};
const noLink = { _id: "n3", type: "SYSTEM_ALERT", title: "Maintenance tonight", message: "Short downtime", isRead: false, createdAt: "2026-09-26T10:00:00.000Z" };

const showNotifications = (notifications, unreadCount = notifications.filter((item) => !item.isRead).length) => {
    api.get.mockResolvedValue({
        data: { data: { notifications, unreadCount, pagination: { page: 1, limit: 10, total: notifications.length, totalPages: 1 } } }
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    showNotifications([unread, read, noLink]);
    api.put.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });
});

const renderPage = () => renderWithProviders(<NotificationsPage />, { preloadedState: authState("STAFF"), route: "/notifications", path: "/notifications" });

describe("NotificationsPage", () => {
    test("lists notifications with their type, message and unread marker", async () => {
        renderPage();

        expect(await screen.findByText("Low stock: Keyboard")).toBeInTheDocument();
        expect(screen.getByText("Keyboard is low in Noida Hub")).toBeInTheDocument();
        // (the same words also appear as options of the type filter, so look at the badges)
        expect(screen.getAllByText("Low stock").length).toBeGreaterThan(1);
        expect(screen.getAllByLabelText("Unread")).toHaveLength(2); // n1 and n3
        expect(api.get).toHaveBeenCalledWith("/notifications", { params: { page: 1, limit: 10 } });
    });

    test("the Unread tab and the type filter are sent to the API", async () => {
        renderPage();
        await screen.findByText("Low stock: Keyboard");

        expect(screen.getByRole("tab", { name: "Unread (2)" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "Unread (2)" }));
        await vi.waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/notifications", { params: { isRead: "false", page: 1, limit: 10 } }));

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "NEW_ORDER");
        await vi.waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/notifications", { params: { isRead: "false", type: "NEW_ORDER", page: 1, limit: 10 } }));
    });

    test("clicking an unread notification marks it read, tells the bell, and opens its page", async () => {
        const changed = vi.fn();
        window.addEventListener(NOTIFICATIONS_CHANGED, changed);
        renderPage();

        await userEvent.click(await screen.findByText("Low stock: Keyboard"));

        expect(api.put).toHaveBeenCalledWith("/notifications/n1/read");
        expect(changed).toHaveBeenCalled();
        expect(await screen.findByText("Another page")).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/inventory");
        window.removeEventListener(NOTIFICATIONS_CHANGED, changed);
    });

    test("clicking an already-read notification just opens its page", async () => {
        renderPage();

        await userEvent.click(await screen.findByText("New order ORD-000001"));

        expect(api.put).not.toHaveBeenCalled();
        expect(screen.getByTestId("location")).toHaveTextContent("/orders/o1");
    });

    test("a notification without a link is read but stays on the page", async () => {
        renderPage();

        await userEvent.click(await screen.findByText("Maintenance tonight"));

        expect(api.put).toHaveBeenCalledWith("/notifications/n3/read");
        expect(screen.getByTestId("location")).toHaveTextContent("/notifications");
    });

    test("'Mark read' does not open the linked page", async () => {
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: 'Mark "Low stock: Keyboard" as read' }));

        expect(api.put).toHaveBeenCalledWith("/notifications/n1/read");
        expect(screen.getByTestId("location")).toHaveTextContent("/notifications");
        // read ones have no Mark read button
        expect(screen.queryByRole("button", { name: 'Mark "New order ORD-000001" as read' })).not.toBeInTheDocument();
    });

    test("mark all as read, and the button is off when nothing is unread", async () => {
        const { unmount } = renderPage();
        await userEvent.click(await screen.findByRole("button", { name: /mark all as read/i }));
        expect(api.put).toHaveBeenCalledWith("/notifications/read-all");
        unmount();

        showNotifications([read], 0);
        renderPage();
        await screen.findByText("New order ORD-000001");
        expect(screen.getByRole("button", { name: /mark all as read/i })).toBeDisabled();
    });

    test("deleting a notification asks the API and refreshes the list", async () => {
        renderPage();
        await screen.findByText("Low stock: Keyboard");
        const callsBefore = api.get.mock.calls.length;

        await userEvent.click(screen.getByRole("button", { name: 'Delete "New order ORD-000001"' }));

        expect(api.delete).toHaveBeenCalledWith("/notifications/n2");
        await vi.waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(callsBefore));
    });

    test("shows the server's message when an action fails", async () => {
        api.put.mockRejectedValue({ response: { data: { message: "Notification not found" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: 'Mark "Low stock: Keyboard" as read' }));

        expect(await screen.findByText("Notification not found")).toBeInTheDocument();
    });

    test("friendly empty messages", async () => {
        showNotifications([], 0);
        renderPage();
        expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Unread" }));
        expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    });
});

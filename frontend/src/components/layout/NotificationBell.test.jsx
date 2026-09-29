import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "./NotificationBell";
import api from "../../services/api";
import { NOTIFICATIONS_CHANGED } from "../../hooks/useUnreadCount";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

let unreadCount;
const notifications = [
    { _id: "n1", title: "New order ORD-000002", message: "Priya placed an order", isRead: false, link: "/orders/o2", createdAt: "2026-09-28T10:00:00.000Z" },
    { _id: "n2", title: "Maintenance tonight", message: "Short downtime", isRead: false, createdAt: "2026-09-27T10:00:00.000Z" }
];

beforeEach(() => {
    vi.clearAllMocks();
    unreadCount = 2;
    api.get.mockImplementation((url) =>
        Promise.resolve(url === "/notifications/unread-count" ? { data: { data: { unreadCount } } } : { data: { data: { notifications } } })
    );
    api.put.mockResolvedValue({ data: {} });
});

const renderBell = () => renderWithProviders(<NotificationBell />, { preloadedState: authState("STAFF"), route: "/dashboard", path: "/dashboard" });

const openBell = async () => {
    await userEvent.click(await screen.findByLabelText(/^Notifications, /));
    return screen.findByText("New order ORD-000002");
};

describe("NotificationBell", () => {
    test("has a 'View all notifications' link to the inbox page", async () => {
        renderBell();
        await openBell();

        expect(screen.getByRole("link", { name: "View all notifications" })).toHaveAttribute("href", "/notifications");
    });

    test("clicking a notification marks it read and opens the page it links to", async () => {
        renderBell();

        await userEvent.click(await openBell());

        expect(api.put).toHaveBeenCalledWith("/notifications/n1/read");
        expect(await screen.findByText("Another page")).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/orders/o2");
    });

    test("a notification without a link is only marked read", async () => {
        renderBell();
        await openBell();

        await userEvent.click(screen.getByText("Maintenance tonight"));

        expect(api.put).toHaveBeenCalledWith("/notifications/n2/read");
        expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    });

    test("the unread number updates at once when another part of the app announces a change", async () => {
        renderBell();
        expect(await screen.findByLabelText("Notifications, 2 unread")).toBeInTheDocument();

        unreadCount = 0;
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

        expect(await screen.findByLabelText("Notifications, 0 unread")).toBeInTheDocument();
    });
});

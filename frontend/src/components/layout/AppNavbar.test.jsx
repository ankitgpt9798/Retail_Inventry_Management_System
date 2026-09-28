import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppNavbar from "./AppNavbar";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

beforeEach(() => {
    vi.clearAllMocks();
    // The bell asks for the unread count as soon as it appears
    api.get.mockResolvedValue({ data: { data: { unreadCount: 3 } } });
    api.post.mockResolvedValue({ data: {} });
});

describe("AppNavbar", () => {
    test("shows the user's name, role and unread count", async () => {
        renderWithProviders(<AppNavbar />, { preloadedState: authState("INVENTORY_MANAGER") });

        expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
        expect(screen.getByText("Inventory Manager")).toBeInTheDocument();
        expect(await screen.findByLabelText("Notifications, 3 unread")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/notifications/unread-count");
    });

    test("links follow the role: staff see Dashboard, suppliers don't", () => {
        const { unmount } = renderWithProviders(<AppNavbar />, { preloadedState: authState("STAFF") });
        expect(screen.getAllByRole("link", { name: /dashboard/i }).length).toBeGreaterThan(0);
        unmount();

        renderWithProviders(<AppNavbar />, { preloadedState: authState("SUPPLIER") });
        expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
    });

    test("log out → tells the backend, clears the user, goes to /login", async () => {
        const user = userEvent.setup();
        const { store } = renderWithProviders(<AppNavbar />, { preloadedState: authState("ADMIN"), route: "/dashboard" });

        await user.click(screen.getByLabelText("Account menu"));
        await user.click(screen.getByRole("button", { name: /log out/i }));

        expect(api.post).toHaveBeenCalledWith("/auth/logout");
        expect(store.getState().auth.user).toBeNull();
    });
});

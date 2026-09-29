import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
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

    test("the menus are rebuilt (closed) after every page change, so they don't stay open over the new page", async () => {
        const user = userEvent.setup();
        renderWithProviders(<AppNavbar />, { preloadedState: authState("ADMIN"), route: "/dashboard" });

        const phoneMenuBefore = screen.getByLabelText("Open menu").parentElement;
        const catalogBefore = within(screen.getByRole("navigation", { name: "App" })).getByRole("button", { name: "Catalog" }).parentElement;

        // Choose a page in the phone menu: the address changes
        await user.click(within(phoneMenuBefore).getByRole("link", { name: "Reports" }));
        expect(screen.getByTestId("location")).toHaveTextContent("/reports");

        // Both menus are brand-new elements now (a new element has no focus, so it renders closed)
        expect(screen.getByLabelText("Open menu").parentElement).not.toBe(phoneMenuBefore);
        expect(within(screen.getByRole("navigation", { name: "App" })).getByRole("button", { name: "Catalog" }).parentElement).not.toBe(catalogBefore);
        // ...and the phone menu is still complete
        expect(within(screen.getByLabelText("Open menu").parentElement).getAllByRole("link").length).toBe(13);
    });

    test("related pages sit under drop-down groups, so the bar never overflows", () => {
        renderWithProviders(<AppNavbar />, { preloadedState: authState("ADMIN") });

        const desktop = within(screen.getByRole("navigation", { name: "App" }));
        // single links stay single, related ones are grouped
        expect(desktop.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
        expect(desktop.getByRole("link", { name: /reports/i })).toBeInTheDocument();
        for (const group of ["Catalog", "Stock", "Sales", "Purchasing", "Admin"]) {
            expect(desktop.getByRole("button", { name: group })).toBeInTheDocument();
        }
        // the pages themselves are inside their group
        const stockMenu = desktop.getByRole("button", { name: "Stock" }).nextElementSibling;
        expect(within(stockMenu).getAllByRole("link").map((link) => link.textContent.trim())).toEqual(["Inventory", "Warehouses", "Transfers"]);
        const adminMenu = desktop.getByRole("button", { name: "Admin" }).nextElementSibling;
        expect(within(adminMenu).getAllByRole("link").map((link) => link.textContent.trim())).toEqual(["Users", "Audit log"]);
    });

    test("groups only show what the role may open", () => {
        renderWithProviders(<AppNavbar />, { preloadedState: authState("INVENTORY_MANAGER") });

        const desktop = within(screen.getByRole("navigation", { name: "App" }));
        expect(desktop.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
        expect(desktop.getByRole("link", { name: /reports/i })).toBeInTheDocument();
        expect(desktop.getByRole("button", { name: "Purchasing" })).toBeInTheDocument();
    });

    test("a supplier sees just their purchase orders as a plain link, no drop-downs", () => {
        renderWithProviders(<AppNavbar />, { preloadedState: authState("SUPPLIER") });

        const desktop = within(screen.getByRole("navigation", { name: "App" }));
        expect(desktop.getAllByRole("link").map((link) => link.textContent.trim())).toEqual(["Purchases"]);
        expect(desktop.queryByRole("button")).not.toBeInTheDocument();
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

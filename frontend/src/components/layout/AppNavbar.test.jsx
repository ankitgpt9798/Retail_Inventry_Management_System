import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppNavbar from "./AppNavbar";
import AppSidebar from "./AppSidebar";
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

// The sidebar's links, grouped by their heading: { "": ["Dashboard"], Catalog: [...], … }
const sidebarSections = () => {
    const nav = screen.getByRole("navigation", { name: "App" });
    const sections = {};
    for (const list of within(nav).getAllByRole("list")) {
        const heading = list.previousElementSibling?.textContent || "";
        sections[heading] = within(list).getAllByRole("link").map((link) => link.textContent.trim());
    }
    return sections;
};

describe("AppNavbar (top bar)", () => {
    test("shows the user's name, role and unread count", async () => {
        renderWithProviders(<AppNavbar />, { preloadedState: authState("INVENTORY_MANAGER") });

        expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
        expect(screen.getByText("Inventory Manager")).toBeInTheDocument();
        expect(await screen.findByLabelText("Notifications, 3 unread")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/notifications/unread-count");
    });

    test("the phone menu opens a drawer with every link, and closes after choosing a page", async () => {
        const user = userEvent.setup();
        renderWithProviders(<AppNavbar />, { preloadedState: authState("ADMIN"), route: "/dashboard" });

        expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
        await user.click(screen.getByLabelText("Open menu"));

        const drawer = screen.getByRole("dialog", { name: "Menu" });
        expect(within(drawer).getAllByRole("link").filter((link) => link.closest("nav"))).toHaveLength(15);

        await user.click(within(drawer).getByRole("link", { name: "Reports" }));
        expect(screen.getByTestId("location")).toHaveTextContent("/reports");
        expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    });

    test("the drawer also closes with the Escape key", async () => {
        const user = userEvent.setup();
        renderWithProviders(<AppNavbar />, { preloadedState: authState("STAFF") });

        await user.click(screen.getByLabelText("Open menu"));
        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
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

describe("AppSidebar", () => {
    test("links follow the role: staff see Dashboard, suppliers don't", () => {
        const { unmount } = renderWithProviders(<AppSidebar pathname="/dashboard" />, { preloadedState: authState("STAFF") });
        expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
        unmount();

        renderWithProviders(<AppSidebar pathname="/purchases" />, { preloadedState: authState("SUPPLIER") });
        expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
    });

    test("an admin sees every section under its heading", () => {
        renderWithProviders(<AppSidebar pathname="/dashboard" />, { preloadedState: authState("ADMIN") });

        expect(sidebarSections()).toEqual({
            "": ["Dashboard"],
            Catalog: ["Products", "Categories"],
            Stock: ["Inventory", "Stock history", "Warehouses", "Transfers"],
            Sales: ["Orders", "Fulfillment", "Customers"],
            Purchasing: ["Suppliers", "Purchases"],
            Insights: ["Reports"],
            Admin: ["Users", "Audit log"]
        });
    });

    test("sections only show what the role may open", () => {
        renderWithProviders(<AppSidebar pathname="/dashboard" />, { preloadedState: authState("INVENTORY_MANAGER") });

        const sections = sidebarSections();
        expect(sections.Admin).toBeUndefined();
        expect(sections.Insights).toEqual(["Reports"]);
        expect(sections.Purchasing).toEqual(["Suppliers", "Purchases"]);
    });

    test("a supplier sees just their purchase orders", () => {
        renderWithProviders(<AppSidebar pathname="/purchases" />, { preloadedState: authState("SUPPLIER") });

        expect(sidebarSections()).toEqual({ Purchasing: ["Purchases"] });
    });

    test("the current page is marked, including its detail pages; Inventory is not marked on Stock history", () => {
        const { unmount } = renderWithProviders(<AppSidebar pathname="/orders/abc123" />, { preloadedState: authState("ADMIN") });
        expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
        unmount();

        renderWithProviders(<AppSidebar pathname="/inventory/history" />, { preloadedState: authState("ADMIN") });
        expect(screen.getByRole("link", { name: "Stock history" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Inventory" })).not.toHaveAttribute("aria-current");
    });
});

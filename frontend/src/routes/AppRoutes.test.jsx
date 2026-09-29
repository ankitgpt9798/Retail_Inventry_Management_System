import { vi } from "vitest";
import { screen } from "@testing-library/react";
import AppRoutes from "./AppRoutes";
import api from "../services/api";
import { authState, renderWithProviders } from "../test/testUtils";

vi.mock("../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

// A lazy page is compiled the first time it is opened, which can take a while on a busy machine
const SLOW = { timeout: 8000 };

// One answer for everything a page might ask on opening
beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
        const empty = { pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
        if (url === "/reports/inventory") return Promise.resolve({ data: { data: { summary: { productCount: 0, totalQuantity: 0, totalReserved: 0, totalAvailable: 0, totalStockValue: 0 }, rows: [] } } });
        if (url === "/notifications/unread-count") return Promise.resolve({ data: { data: { unreadCount: 0 } } });
        if (url === "/audit-logs/filters") return Promise.resolve({ data: { data: { actions: [], entityTypes: [] } } });
        return Promise.resolve({
            data: { data: { ...empty, users: [], warehouses: [], categories: [], suppliers: [], products: [], notifications: [], unreadCount: 0, auditLogs: [], purchases: [], orders: [] } }
        });
    });
});

// AppRoutes has its own <Routes>, so it is mounted at "*" here and handles every URL itself
const renderAt = (route, role) => renderWithProviders(<AppRoutes />, { preloadedState: authState(role), route, path: "*" });

describe("AppRoutes", () => {
    test("staff pages are downloaded when opened (a spinner first, then the page)", async () => {
        renderAt("/reports", "ADMIN");

        expect(await screen.findByRole("heading", { name: "Reports" }, SLOW)).toBeInTheDocument();
        expect(await screen.findByText("No data for these filters.", {}, SLOW)).toBeInTheDocument();
    });

    test("every new staff page opens for the role that owns it", async () => {
        renderAt("/users", "ADMIN");
        expect(await screen.findByRole("heading", { name: "Users" }, SLOW)).toBeInTheDocument();
    });

    test.each([
        ["/users", "STAFF"],
        ["/users", "INVENTORY_MANAGER"],
        ["/audit-logs", "INVENTORY_MANAGER"],
        ["/reports", "STAFF"],
        ["/reports", "SUPPLIER"],
        ["/suppliers", "STAFF"],
        ["/transfers", "STAFF"],
        ["/orders/new", "INVENTORY_MANAGER"],
        ["/purchases/new", "SUPPLIER"]
    ])("%s is closed to %s: they see the 'no access' page", async (route, role) => {
        renderAt(route, role);

        expect(await screen.findByText("You don't have access to this page", {}, SLOW)).toBeInTheDocument();
    });

    test("everyone has a notifications inbox, suppliers included", async () => {
        renderAt("/notifications", "SUPPLIER");

        expect(await screen.findByRole("heading", { name: "Notifications" }, SLOW)).toBeInTheDocument();
    });

    test("someone who isn't logged in is sent to the login page", async () => {
        renderAt("/reports", null);

        await vi.waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
        // and the report page itself never opened
        expect(screen.queryByRole("heading", { name: "Reports" })).not.toBeInTheDocument();
    });
});

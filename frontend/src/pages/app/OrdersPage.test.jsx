import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrdersPage from "./OrdersPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const orders = [
    {
        _id: "o1", orderNumber: "ORD-000001", status: "CONFIRMED", totalAmount: 120472.1, createdAt: "2026-09-28T10:00:00.000Z",
        customer: { name: "Priya Sharma" }, warehouse: { name: "Delhi Central", code: "DEL-01" }
    },
    {
        _id: "o2", orderNumber: "ORD-000002", status: "CANCELLED", totalAmount: 500, createdAt: "2026-09-27T10:00:00.000Z",
        customer: { name: "Amit Verma" }, warehouse: { name: "Delhi Central", code: "DEL-01" }
    }
];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) =>
        Promise.resolve(
            url === "/warehouses"
                ? { data: { data: { warehouses: [{ _id: "w1", name: "Delhi Central" }] } } }
                : { data: { data: { orders, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } } }
        )
    );
});

const renderPage = (role) => renderWithProviders(<OrdersPage />, { preloadedState: authState(role), route: "/orders", path: "/orders" });

describe("OrdersPage", () => {
    test("lists orders with customer, status, total and a link to each", async () => {
        renderPage("ADMIN");

        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
        expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
        expect(screen.getByText("₹1,20,472.10")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View ORD-000001" })).toHaveAttribute("href", "/orders/o1");
        expect(api.get).toHaveBeenCalledWith("/orders", { params: { page: 1, limit: 10 } });
    });

    test("staff and admin can start a new order", async () => {
        renderPage("STAFF");
        expect(await screen.findByRole("link", { name: /new order/i })).toHaveAttribute("href", "/orders/new");
    });

    test("an inventory manager can only view orders", async () => {
        renderPage("INVENTORY_MANAGER");

        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /new order/i })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View ORD-000001" })).toBeInTheDocument();
    });

    test("search, status, warehouse and date filters are sent to the API (end date covers the whole day)", async () => {
        renderPage("ADMIN");
        await screen.findByText("ORD-000001");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "SHIPPED");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warehouse" }), "w1");
        await userEvent.type(screen.getByLabelText("From"), "2026-09-01");
        await userEvent.type(screen.getByLabelText("To"), "2026-09-28");
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "priya");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/orders", {
                params: {
                    search: "priya", status: "SHIPPED", warehouse: "w1",
                    from: "2026-09-01T00:00:00", to: "2026-09-28T23:59:59", page: 1, limit: 10
                }
            })
        );
    });

    test("shows an error with a retry button when loading fails", async () => {
        // Only the orders request fails, and only the first time
        api.get.mockReset();
        let ordersCalls = 0;
        api.get.mockImplementation((url) => {
            if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses: [] } } });
            ordersCalls += 1;
            return ordersCalls === 1
                ? Promise.reject({ response: { data: { message: "Database is down" } } })
                : Promise.resolve({ data: { data: { orders, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } } });
        });
        renderPage("ADMIN");

        expect(await screen.findByText("Database is down")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
    });
});

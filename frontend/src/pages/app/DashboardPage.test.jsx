import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

beforeEach(() => {
    vi.clearAllMocks();
});

const dashboardResponse = {
    data: {
        data: {
            kpis: {
                totalProducts: 4, totalCategories: 2, totalWarehouses: 3, totalSuppliers: 2,
                totalInventory: 1917, lowStockProducts: 1,
                totalOrders: 1, pendingOrders: 0, completedOrders: 1, pendingPurchases: 0,
                stockValue: 10567900, outOfStockProducts: 2, totalCustomers: 5, unconfirmedOrders: 0
            },
            charts: { ordersByMonth: [{ month: "2026-08", orders: 0, revenue: 0 }, { month: "2026-09", orders: 1, revenue: 120472.1 }] }
        }
    }
};

describe("DashboardPage", () => {
    test("loads the KPIs from the reports API and shows them", async () => {
        api.get.mockResolvedValue(dashboardResponse);
        renderWithProviders(<DashboardPage />, { preloadedState: authState("INVENTORY_MANAGER") });

        expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
        expect(await screen.findByTestId("kpi-totalInventory")).toHaveTextContent("1,917");
        expect(screen.getByTestId("kpi-lowStockProducts")).toHaveTextContent("1");
        expect(screen.getByText(/1 sales orders · ₹1,20,472.10 revenue/)).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/reports/dashboard");
    });

    test("stock value, out of stock and customers come from the API; big rupee amounts are shown in full", async () => {
        api.get.mockResolvedValue(dashboardResponse);
        renderWithProviders(<DashboardPage />, { preloadedState: authState("ADMIN") });

        expect(await screen.findByTestId("kpi-stockValue")).toHaveTextContent("₹1,05,67,900.00");
        expect(screen.getByTestId("kpi-outOfStockProducts")).toHaveTextContent("2");
        expect(screen.getByTestId("kpi-totalCustomers")).toHaveTextContent("5");
    });

    test("greets the user by first name", async () => {
        api.get.mockResolvedValue(dashboardResponse);
        renderWithProviders(<DashboardPage />, { preloadedState: authState("STAFF") });

        expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/, Ravi$/);
    });

    test("an error shows a message with 'Try again', which reloads", async () => {
        api.get
            .mockRejectedValueOnce({ request: {} })     // no answer from the server
            .mockResolvedValueOnce(dashboardResponse);
        const user = userEvent.setup();
        renderWithProviders(<DashboardPage />, { preloadedState: authState("ADMIN") });

        expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");

        await user.click(screen.getByRole("button", { name: "Try again" }));

        expect(await screen.findByTestId("kpi-totalProducts")).toHaveTextContent("4");
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    test("shows the trend charts under the KPIs, with a table view for each", async () => {
        const full = JSON.parse(JSON.stringify(dashboardResponse));
        full.data.data.charts = {
            ...full.data.data.charts,
            purchaseTrends: [{ month: "2026-09", purchaseOrders: 1, value: 50000 }],
            stockMovement: [{ month: "2026-09", STOCK_IN: 60, STOCK_OUT: 5, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJUSTMENT: 0 }],
            orderStatusDistribution: [{ status: "DELIVERED", count: 1 }],
            inventoryByWarehouse: [{ code: "DEL-01", name: "Delhi Central", quantity: 68, utilizationPercent: 1 }],
            topProducts: [{ name: "Laptop Pro", sku: "LAP-001", unitsSold: 2, revenue: 100000 }]
        };
        api.get.mockResolvedValue(full);
        renderWithProviders(<DashboardPage />, { preloadedState: authState("ADMIN") });

        expect(await screen.findByText("Trends · last 6 months")).toBeInTheDocument();
        for (const title of ["Revenue by month (₹)", "Purchases by month (₹)", "Stock in and out", "Order status", "Stock by warehouse", "Top products"]) {
            expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
        }

        await userEvent.click(screen.getByRole("button", { name: "View table: Top products" }));
        expect(within(screen.getByRole("region", { name: "Top products" })).getByRole("cell", { name: "Laptop Pro" })).toBeInTheDocument();
    });
});

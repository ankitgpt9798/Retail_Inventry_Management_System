import { vi } from "vitest";
import { screen } from "@testing-library/react";
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
                totalOrders: 1, pendingOrders: 0, completedOrders: 1, pendingPurchases: 0
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
});

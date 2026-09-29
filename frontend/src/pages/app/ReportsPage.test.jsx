import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPage from "./ReportsPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const range = { from: "2026-04-01", to: "2026-09-30" };
const months = ["2026-08", "2026-09"];

// What each report endpoint answers (shapes copied from the backend's reportService)
const responses = {
    "/reports/inventory": {
        summary: { productCount: 2, totalQuantity: 1917, totalReserved: 5, totalAvailable: 1912, totalStockValue: 250000.5 },
        rows: [
            { productId: "p1", name: "Laptop Pro", sku: "LAP-001", category: "Electronics", quantity: 100, reservedQuantity: 5, availableQuantity: 95, costPrice: 700, stockValue: 70000 },
            { productId: "p2", name: "Mouse", sku: "MOU-M185", category: "Electronics", quantity: 80, reservedQuantity: 0, availableQuantity: 80, costPrice: 150, stockValue: 12000 }
        ]
    },
    "/reports/warehouses": {
        summary: { warehouseCount: 1, totalCapacity: 5000, totalQuantity: 1000, totalStockValue: 90000, overallUtilizationPercent: 20 },
        rows: [{ warehouseId: "w1", code: "DEL-01", name: "Delhi Central", city: "Delhi", manager: null, capacity: 5000, totalQuantity: 1000, availableQuantity: 990, utilizationPercent: 20, stockValue: 90000 }]
    },
    "/reports/stock-movement": {
        range,
        totals: {
            STOCK_IN: { quantity: 400, count: 4 }, STOCK_OUT: { quantity: 60, count: 2 }, TRANSFER_IN: { quantity: 30, count: 1 },
            TRANSFER_OUT: { quantity: 30, count: 1 }, ADJUSTMENT: { quantity: 0, count: 0 }
        },
        byMonth: months.map((month, i) => ({ month, STOCK_IN: [100, 300][i], STOCK_OUT: [10, 50][i], TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJUSTMENT: 0 }))
    },
    "/reports/orders": {
        range,
        summary: { totalOrders: 5, salesOrders: 3, cancelledOrders: 1, completedOrders: 2, revenue: 120472.1, averageOrderValue: 40157.37 },
        byStatus: [{ status: "CONFIRMED", count: 1, totalAmount: 5000 }, { status: "DELIVERED", count: 2, totalAmount: 115472.1 }],
        byMonth: months.map((month, i) => ({ month, orders: [0, 3][i], revenue: [0, 120472.1][i] }))
    },
    "/reports/purchases": {
        range,
        summary: { totalPurchaseOrders: 2, openPurchaseOrders: 1, orderedValue: 50000, receivedValue: 20000 },
        byStatus: [{ status: "ORDERED", count: 1, totalAmount: 30000 }],
        byMonth: months.map((month, i) => ({ month, purchaseOrders: [0, 2][i], value: [0, 50000][i] }))
    },
    "/reports/suppliers": {
        range,
        rows: [
            { supplierId: "s1", name: "Acme Electronics", purchaseOrders: 2, unitsOrdered: 100, unitsReceived: 80, orderedValue: 50000, receivedValue: 40000, fulfilmentRatePercent: 80, openPurchaseOrders: 1 },
            { supplierId: "s2", name: "Bharat Foods", purchaseOrders: 0, unitsOrdered: 0, unitsReceived: 0, orderedValue: 0, receivedValue: 0, fulfilmentRatePercent: null, openPurchaseOrders: 0 }
        ]
    },
    "/reports/low-stock": {
        summary: { itemCount: 1, totalShortage: 12 },
        rows: [{
            inventoryId: "i1", product: { name: "Keyboard", sku: "KEY-K100" }, warehouse: { code: "NOI-01", name: "Noida Hub" },
            quantity: 20, reservedQuantity: 12, availableQuantity: 8, reorderLevel: 20, shortage: 12, onOrderQuantity: 30
        }]
    },
    "/reports/product-performance": {
        range, sortBy: "units",
        rows: [{ productId: "p1", name: "Laptop Pro", sku: "LAP-001", unitsSold: 64, revenue: 607000, orderCount: 20 }]
    }
};

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
        if (responses[url]) return Promise.resolve({ data: { data: responses[url] } });
        if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses: [{ _id: "w1", name: "Delhi Central" }] } } });
        if (url === "/categories") return Promise.resolve({ data: { data: { categories: [{ _id: "c1", name: "Electronics" }] } } });
        if (url === "/suppliers") return Promise.resolve({ data: { data: { suppliers: [{ _id: "s1", name: "Acme Electronics" }] } } });
        return Promise.reject(new Error(`unexpected ${url}`));
    });
});

const renderPage = () => renderWithProviders(<ReportsPage />, { preloadedState: authState("INVENTORY_MANAGER"), route: "/reports", path: "/reports" });

const lastReportCall = () => api.get.mock.calls.filter(([url]) => url.startsWith("/reports/")).at(-1);

describe("ReportsPage", () => {
    test("opens on the inventory report with its numbers and table", async () => {
        renderPage();

        expect(await screen.findByText("Laptop Pro")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Inventory" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("1,917")).toBeInTheDocument();
        expect(screen.getByText("₹2,50,000.50")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/reports/inventory", { params: {} });
    });

    test("has a tab for each of the eight reports", async () => {
        renderPage();
        await screen.findByText("Laptop Pro");

        expect(within(screen.getByRole("tablist", { name: "Reports" })).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
            "Inventory", "Warehouses", "Stock movement", "Orders", "Purchases", "Suppliers", "Low stock", "Best sellers"
        ]);
    });

    test.each([
        ["Warehouses", "/reports/warehouses", "Delhi Central", "20%"],
        ["Suppliers", "/reports/suppliers", "Acme Electronics", "80%"],
        ["Low stock", "/reports/low-stock", "Keyboard (KEY-K100)", "12"],
        ["Best sellers", "/reports/product-performance", "SKU", "607,000"]
    ])("the %s tab loads %s", async (tab, path, expectedText) => {
        renderPage();
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("tab", { name: tab }));

        await vi.waitFor(() => expect(lastReportCall()[0]).toBe(path));
        expect((await screen.findAllByText(expectedText)).length).toBeGreaterThan(0);
    });

    test("a supplier that was never used shows '—' for delivery rate, not 0%", async () => {
        renderPage();
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("tab", { name: "Suppliers" }));

        const row = (await screen.findByText("Bharat Foods")).closest("tr");
        expect(within(row).getByText("—")).toBeInTheDocument();
        expect(within(row).queryByText("0%")).not.toBeInTheDocument();
    });

    test("orders report: headline numbers, a revenue chart and the status table", async () => {
        renderPage();
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("tab", { name: "Orders" }));

        expect(await screen.findByText("Average order")).toBeInTheDocument();
        expect(screen.getAllByText("₹1,20,472.10").length).toBeGreaterThan(0);
        expect(screen.getByRole("region", { name: "Revenue by month (₹)" })).toBeInTheDocument();
        expect(screen.getByText("By status")).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "Delivered" })).toBeInTheDocument();
    });

    test("stock movement report shows all five types in its table", async () => {
        renderPage();
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("tab", { name: "Stock movement" }));

        for (const type of ["Stock in", "Stock out", "Transfer in", "Transfer out", "Adjustment"]) {
            expect((await screen.findAllByRole("cell", { name: type })).length).toBeGreaterThan(0);
        }
    });

    test("filters are sent to the API: date range and warehouse on the orders report", async () => {
        renderPage();
        await screen.findByText("Laptop Pro");
        await userEvent.click(screen.getByRole("tab", { name: "Orders" }));
        await screen.findByText("Average order");

        expect(screen.getByText(/No dates chosen: showing the last 6 months/)).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("From"), "2026-09-01");
        await userEvent.type(screen.getByLabelText("To"), "2026-09-28");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warehouse" }), "w1");

        await vi.waitFor(() =>
            expect(lastReportCall()).toEqual(["/reports/orders", { params: { from: "2026-09-01", to: "2026-09-28", warehouse: "w1" } }])
        );
        expect(screen.queryByText(/No dates chosen/)).not.toBeInTheDocument();
    });

    test("each report offers only its own filters, and switching reports starts fresh", async () => {
        renderPage();
        await screen.findByText("Laptop Pro");

        // Inventory: warehouse + category, no dates
        expect(screen.getByRole("combobox", { name: "Category" })).toBeInTheDocument();
        expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Category" }), "c1");
        await vi.waitFor(() => expect(lastReportCall()).toEqual(["/reports/inventory", { params: { category: "c1" } }]));

        // Best sellers: rank + count, and the category choice from before is gone
        await userEvent.click(screen.getByRole("tab", { name: "Best sellers" }));
        await vi.waitFor(() => expect(lastReportCall()[0]).toBe("/reports/product-performance"));
        expect(lastReportCall()[1]).toEqual({ params: { sortBy: "units", limit: "10" } });
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rank by" }), "revenue");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "5");
        await vi.waitFor(() => expect(lastReportCall()[1]).toEqual({ params: { sortBy: "revenue", limit: "5" } }));

        // The warehouses report has no filters at all
        await userEvent.click(screen.getByRole("tab", { name: "Warehouses" }));
        await screen.findByText("Delhi Central", { selector: "td" });
        expect(screen.queryByRole("combobox", { name: "Warehouse" })).not.toBeInTheDocument();
    });

    test("shows the server's message with a retry button when a report fails", async () => {
        let failNext = true;
        api.get.mockImplementation((url) => {
            if (url === "/reports/inventory" && failNext) {
                failNext = false;
                return Promise.reject({ response: { data: { message: "from cannot be after to" } } });
            }
            if (responses[url]) return Promise.resolve({ data: { data: responses[url] } });
            return Promise.resolve({ data: { data: { warehouses: [], categories: [], suppliers: [] } } });
        });
        renderPage();

        expect(await screen.findByText("from cannot be after to")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Laptop Pro")).toBeInTheDocument();
    });

    test("says so when a report has no rows", async () => {
        api.get.mockImplementation((url) => {
            if (url === "/reports/inventory") return Promise.resolve({ data: { data: { summary: { productCount: 0, totalQuantity: 0, totalReserved: 0, totalAvailable: 0, totalStockValue: 0 }, rows: [] } } });
            return Promise.resolve({ data: { data: { warehouses: [], categories: [], suppliers: [] } } });
        });
        renderPage();

        expect(await screen.findByText("No data for these filters.")).toBeInTheDocument();
    });
});

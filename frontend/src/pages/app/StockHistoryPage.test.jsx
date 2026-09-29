import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StockHistoryPage from "./StockHistoryPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn() } };
});

const base = {
    product: { name: "Laptop Pro", sku: "LAP-001" }, warehouse: { name: "Delhi Central" },
    performedBy: { name: "Ravi Kumar" }, createdAt: "2026-09-28T10:30:00.000Z"
};
const transactions = [
    { ...base, _id: "t1", type: "STOCK_IN", quantity: 25, quantityBefore: 75, quantityAfter: 100, note: "New delivery" },
    { ...base, _id: "t2", type: "STOCK_OUT", quantity: 5, quantityBefore: 100, quantityAfter: 95, note: "damaged" }
];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) =>
        Promise.resolve(
            url === "/warehouses"
                ? { data: { data: { warehouses: [{ _id: "w1", name: "Delhi Central" }] } } }
                : { data: { data: { transactions, pagination: { page: 1, limit: 15, total: 2, totalPages: 1 } } } }
        )
    );
});

const renderPage = () =>
    renderWithProviders(<StockHistoryPage />, { preloadedState: authState("STAFF"), route: "/inventory/history", path: "/inventory/history" });

describe("StockHistoryPage", () => {
    test("shows each movement with its direction, before/after and note", async () => {
        renderPage();

        expect(await screen.findByText("New delivery")).toBeInTheDocument();
        expect(screen.getByText("+25")).toHaveClass("text-success");
        expect(screen.getByText("−5")).toHaveClass("text-error");
        expect(screen.getByText("75 → 100")).toBeInTheDocument();
        expect(screen.getAllByText("Ravi Kumar")).toHaveLength(2);
        expect(api.get).toHaveBeenCalledWith("/inventory/transactions", { params: { page: 1, limit: 15 } });
    });

    test("type, warehouse and date filters are sent to the API (the end date covers the whole day)", async () => {
        renderPage();
        await screen.findByText("New delivery");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "STOCK_OUT");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warehouse" }), "w1");
        await userEvent.type(screen.getByLabelText("From"), "2026-09-01");
        await userEvent.type(screen.getByLabelText("To"), "2026-09-28");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/inventory/transactions", {
                params: {
                    type: "STOCK_OUT", warehouse: "w1", from: "2026-09-01T00:00:00", to: "2026-09-28T23:59:59", page: 1, limit: 15
                }
            })
        );
    });

    test("shows an empty message when there are no movements", async () => {
        api.get.mockImplementation((url) =>
            Promise.resolve(
                url === "/warehouses"
                    ? { data: { data: { warehouses: [] } } }
                    : { data: { data: { transactions: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 0 } } } }
            )
        );
        renderPage();

        expect(await screen.findByText("No stock movements found.")).toBeInTheDocument();
    });
});

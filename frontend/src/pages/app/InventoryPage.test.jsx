import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventoryPage from "./InventoryPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const products = [{ _id: "p1", name: "Laptop Pro", sku: "LAP-001" }, { _id: "p2", name: "Keyboard", sku: "KEY-K100" }];
const warehouses = [
    { _id: "w1", name: "Delhi Central", code: "DEL-01", status: "ACTIVE" },
    { _id: "w2", name: "Old Depot", code: "OLD-01", status: "INACTIVE" }
];

const laptopInDelhi = {
    _id: "i1", product: { _id: "p1", name: "Laptop Pro", sku: "LAP-001" }, warehouse: { _id: "w1", name: "Delhi Central", code: "DEL-01" },
    quantity: 100, reservedQuantity: 5, availableQuantity: 95, reorderLevel: 10
};
const keyboardInDelhi = {
    _id: "i2", product: { _id: "p2", name: "Keyboard", sku: "KEY-K100" }, warehouse: { _id: "w1", name: "Delhi Central", code: "DEL-01" },
    quantity: 20, reservedQuantity: 12, availableQuantity: 8, reorderLevel: 10
};

const inventoryResponse = (inventories) => ({
    data: { data: { inventories, pagination: { page: 1, limit: 10, total: inventories.length, totalPages: 1 } } }
});

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
        if (url === "/products") return Promise.resolve({ data: { data: { products } } });
        if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses } } });
        return Promise.resolve(inventoryResponse([laptopInDelhi, keyboardInDelhi]));
    });
});

const renderPage = (role) => renderWithProviders(<InventoryPage />, { preloadedState: authState(role), route: "/inventory", path: "/inventory" });

describe("InventoryPage", () => {
    test("lists stock with on hand, reserved and available, and flags low stock", async () => {
        renderPage("ADMIN");

        expect(await screen.findByText("Laptop Pro")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/inventory", { params: { page: 1, limit: 10 } });
        // Only the keyboard (available 8 < reorder level 10) is low
        expect(screen.getAllByText("Low stock")).toHaveLength(1);
        const keyboardRow = screen.getByText("Keyboard").closest("tr");
        expect(within(keyboardRow).getByText("Low stock")).toBeInTheDocument();
    });

    test("staff can only view: no stock in/out or reorder buttons", async () => {
        renderPage("STAFF");

        expect(await screen.findByText("Laptop Pro")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /stock in/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /stock out/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /reorder level/i })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /stock history/i })).toHaveAttribute("href", "/inventory/history");
    });

    test("search, warehouse and low-stock filters are sent to the API", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warehouse" }), "w1");
        await userEvent.click(screen.getByLabelText("Low stock only"));
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "lap");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/inventory", {
                params: { search: "lap", warehouse: "w1", lowStock: "true", page: 1, limit: 10 }
            })
        );
    });

    test("admin adds stock from the header button", async () => {
        api.post.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Stock in" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.selectOptions(within(dialog).getByLabelText("Product"), "p1");
        await userEvent.selectOptions(within(dialog).getByLabelText("Warehouse"), "w1");
        await userEvent.clear(within(dialog).getByLabelText("Quantity"));
        await userEvent.type(within(dialog).getByLabelText("Quantity"), "25");
        await userEvent.click(within(dialog).getByRole("button", { name: "Add stock" }));

        expect(api.post).toHaveBeenCalledWith("/inventory/stock-in", { product: "p1", warehouse: "w1", quantity: 25, note: "" });
        expect(await screen.findByText("Stock added.")).toBeInTheDocument();
    });

    test("only ACTIVE warehouses can be chosen in the stock form", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Stock in" }));
        const select = within(screen.getByRole("dialog")).getByLabelText("Warehouse");

        expect(within(select).getByRole("option", { name: /Delhi Central/ })).toBeInTheDocument();
        expect(within(select).queryByRole("option", { name: /Old Depot/ })).not.toBeInTheDocument();
    });

    test("a row's In/Out button pre-selects its product and warehouse", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Remove stock from Laptop Pro in Delhi Central" }));
        const dialog = screen.getByRole("dialog");

        expect(within(dialog).getByLabelText("Product")).toHaveValue("p1");
        expect(within(dialog).getByLabelText("Warehouse")).toHaveValue("w1");
    });

    test("stock out needs a reason and shows the server's refusal (e.g. not enough stock)", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "Only 95 unit(s) available" } } });
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Remove stock from Laptop Pro in Delhi Central" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove stock" }));
        expect(await within(dialog).findByText(/give a reason/i)).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();

        await userEvent.type(within(dialog).getByLabelText("Reason"), "damaged");
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove stock" }));

        expect(api.post).toHaveBeenCalledWith("/inventory/stock-out", { product: "p1", warehouse: "w1", quantity: 1, note: "damaged" });
        expect(await screen.findByText("Only 95 unit(s) available")).toBeInTheDocument();
    });

    test("admin changes a reorder level", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage("INVENTORY_MANAGER");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Edit reorder level of Laptop Pro in Delhi Central" }));
        const dialog = screen.getByRole("dialog");
        const input = within(dialog).getByLabelText("Reorder level");
        expect(input).toHaveValue(10);
        await userEvent.clear(input);
        await userEvent.type(input, "30");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        expect(api.put).toHaveBeenCalledWith("/inventory/i1/reorder-level", { reorderLevel: 30 });
        expect(await screen.findByText("Reorder level updated.")).toBeInTheDocument();
    });

    test("shows a friendly message when nothing is low on stock", async () => {
        api.get.mockImplementation((url) =>
            Promise.resolve(url === "/inventory" ? inventoryResponse([]) : { data: { data: { products, warehouses } } })
        );
        renderPage("ADMIN");

        await userEvent.click(await screen.findByLabelText("Low stock only"));
        expect(await screen.findByText("No products are low on stock.")).toBeInTheDocument();
    });
});

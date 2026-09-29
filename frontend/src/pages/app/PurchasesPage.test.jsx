import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PurchasesPage from "./PurchasesPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const purchases = [
    {
        _id: "po1", poNumber: "PO-000001", status: "ORDERED", totalAmount: 50000, createdAt: "2026-09-28T10:00:00.000Z",
        supplier: { _id: "s1", name: "Acme Electronics" }, warehouse: { name: "Noida Hub", code: "NOI-01" }
    }
];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
        if (url === "/suppliers") return Promise.resolve({ data: { data: { suppliers: [{ _id: "s1", name: "Acme Electronics" }] } } });
        if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses: [{ _id: "w1", name: "Noida Hub" }] } } });
        return Promise.resolve({ data: { data: { purchases, pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } } });
    });
});

const renderPage = (role) => renderWithProviders(<PurchasesPage />, { preloadedState: authState(role), route: "/purchases", path: "/purchases" });

describe("PurchasesPage — manager", () => {
    test("lists purchase orders with supplier, warehouse, status and total", async () => {
        renderPage("INVENTORY_MANAGER");

        expect(await screen.findByText("PO-000001")).toBeInTheDocument();
        expect(screen.getAllByText("Acme Electronics").length).toBeGreaterThan(0);
        expect(screen.getByText("Noida Hub", { selector: "td" })).toBeInTheDocument();
        expect(screen.getByText("₹50,000.00")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View PO-000001" })).toHaveAttribute("href", "/purchases/po1");
        expect(screen.getByRole("link", { name: /new purchase order/i })).toHaveAttribute("href", "/purchases/new");
    });

    test("search, status, supplier and warehouse filters are sent to the API", async () => {
        renderPage("ADMIN");
        await screen.findByText("PO-000001");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "APPROVED");
        await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Supplier" }), "s1");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Warehouse" }), "w1");
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "PO-0");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/purchases", {
                params: { search: "PO-0", status: "APPROVED", supplier: "s1", warehouse: "w1", page: 1, limit: 10 }
            })
        );
    });
});

describe("PurchasesPage — supplier portal", () => {
    test("a supplier sees a portal view: no create button, no supplier/warehouse filters, and never asks for those lists", async () => {
        renderPage("SUPPLIER");

        expect(await screen.findByText("My purchase orders")).toBeInTheDocument();
        expect(await screen.findByText("PO-000001")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /new purchase order/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Supplier" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Warehouse" })).not.toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Supplier" })).not.toBeInTheDocument();
        // Those lists are forbidden for suppliers, so they must not even be requested
        expect(api.get).not.toHaveBeenCalledWith("/suppliers", expect.anything());
        expect(api.get).not.toHaveBeenCalledWith("/warehouses", expect.anything());
    });
});

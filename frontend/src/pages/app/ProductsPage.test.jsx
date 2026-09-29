import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsPage from "./ProductsPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const categories = [
    { _id: "c1", name: "Electronics", status: "ACTIVE" },
    { _id: "c2", name: "Grocery", status: "INACTIVE" }
];

const laptop = {
    _id: "p1", name: "Laptop Pro", sku: "LAP-001", brand: "Acme", barcode: "", description: "",
    category: { _id: "c1", name: "Electronics" }, costPrice: 700, sellingPrice: 949.5, taxRate: 18,
    reorderLevel: 10, imageUrl: "", status: "ACTIVE"
};
const rice = { ...laptop, _id: "p2", name: "Rice 5kg", sku: "RICE-5KG", brand: "", status: "INACTIVE" };

const productsResponse = (products, pagination) => ({
    data: { data: { products, pagination: pagination || { page: 1, limit: 10, total: products.length, totalPages: 1 } } }
});

beforeEach(() => {
    vi.clearAllMocks();
    // One mock answers both URLs the page uses
    api.get.mockImplementation((url) =>
        Promise.resolve(url === "/categories" ? { data: { data: { categories } } } : productsResponse([laptop, rice]))
    );
});

const renderPage = (role) => renderWithProviders(<ProductsPage />, { preloadedState: authState(role), route: "/products", path: "/products" });

describe("ProductsPage", () => {
    test("lists products with formatted prices and the category name", async () => {
        renderPage("ADMIN");

        expect(await screen.findByText("Laptop Pro")).toBeInTheDocument();
        expect(screen.getByText("LAP-001")).toBeInTheDocument();
        expect(screen.getAllByText("₹949.50")).toHaveLength(2); // both sample rows
        expect(screen.getAllByText("Electronics").length).toBeGreaterThan(0);
        expect(api.get).toHaveBeenCalledWith("/products", { params: { sort: "newest", page: 1, limit: 10 } });
    });

    test.each(["INVENTORY_MANAGER", "STAFF"])("%s can only view products", async (role) => {
        renderPage(role);

        expect(await screen.findByText("Laptop Pro")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /new product/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    });

    test("search, category and status filters are sent to the API", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Category" }), "c1");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "ACTIVE");
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "lap");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/products", {
                params: { search: "lap", status: "ACTIVE", category: "c1", sort: "newest", page: 1, limit: 10 }
            })
        );
    });

    test("pagination asks for the next page, and a filter change goes back to page 1", async () => {
        api.get.mockImplementation((url) =>
            Promise.resolve(
                url === "/categories"
                    ? { data: { data: { categories } } }
                    : productsResponse([laptop], { page: 1, limit: 10, total: 25, totalPages: 3 })
            )
        );
        renderPage("ADMIN");
        await screen.findByText("Page 1 of 3 · 25 items");

        await userEvent.click(screen.getByRole("button", { name: "Next page" }));
        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/products", { params: expect.objectContaining({ page: 2 }) })
        );

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "ACTIVE");
        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/products", { params: expect.objectContaining({ status: "ACTIVE", page: 1 }) })
        );
    });

    test("admin creates a product; numbers are sent as numbers", async () => {
        api.post.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: /new product/i }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Name"), "USB Cable");
        await userEvent.type(within(dialog).getByLabelText(/^SKU/), "USB-001");
        await userEvent.selectOptions(within(dialog).getByLabelText("Category"), "c1");
        await userEvent.clear(within(dialog).getByLabelText("Cost price (₹)"));
        await userEvent.type(within(dialog).getByLabelText("Cost price (₹)"), "50");
        await userEvent.clear(within(dialog).getByLabelText("Selling price (₹)"));
        await userEvent.type(within(dialog).getByLabelText("Selling price (₹)"), "99.5");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create product" }));

        expect(api.post).toHaveBeenCalledWith("/products", {
            name: "USB Cable", sku: "USB-001", barcode: "", brand: "", description: "", category: "c1",
            costPrice: 50, sellingPrice: 99.5, taxRate: 0, reorderLevel: 10, imageUrl: ""
        });
        expect(await screen.findByText("Product created.")).toBeInTheDocument();
    });

    test("the form only offers ACTIVE categories", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: /new product/i }));
        const select = within(screen.getByRole("dialog")).getByLabelText("Category");

        expect(within(select).getByRole("option", { name: "Electronics" })).toBeInTheDocument();
        expect(within(select).queryByRole("option", { name: "Grocery" })).not.toBeInTheDocument();
    });

    test("the form shows field errors and does not call the API when invalid", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: /new product/i }));
        await userEvent.type(screen.getByLabelText(/^SKU/), "bad sku!");
        await userEvent.click(screen.getByRole("button", { name: "Create product" }));

        expect(await screen.findByText("SKU can only contain letters, numbers and dashes")).toBeInTheDocument();
        expect(screen.getByText("Product name must be at least 2 characters")).toBeInTheDocument();
        expect(screen.getByText("Choose a category")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("shows the server's message when saving fails (e.g. duplicate SKU)", async () => {
        api.put.mockRejectedValue({ response: { data: { message: "A product with this SKU already exists" } } });
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Edit Laptop Pro" }));
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(await screen.findByText("A product with this SKU already exists")).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("admin edits a product (form is pre-filled)", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Edit Laptop Pro" }));
        const price = screen.getByLabelText("Selling price (₹)");
        expect(price).toHaveValue(949.5);
        await userEvent.clear(price);
        await userEvent.type(price, "999");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/products/p1", expect.objectContaining({ sku: "LAP-001", category: "c1", sellingPrice: 999 }));
        expect(await screen.findByText("Product updated.")).toBeInTheDocument();
    });

    test("deactivating asks for confirmation, then calls DELETE", async () => {
        api.delete.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Laptop Pro" }));
        expect(api.delete).not.toHaveBeenCalled();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(api.delete).toHaveBeenCalledWith("/products/p1");
        expect(await screen.findByText("Product deactivated.")).toBeInTheDocument();
    });

    test("cancelling the confirmation does nothing", async () => {
        renderPage("ADMIN");
        await screen.findByText("Laptop Pro");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Laptop Pro" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(api.delete).not.toHaveBeenCalled();
    });
});

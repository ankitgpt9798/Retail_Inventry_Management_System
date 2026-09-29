import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderFormPage from "./OrderFormPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const products = [
    { _id: "p1", name: "Laptop Pro", sku: "LAP-001", sellingPrice: 1000, taxRate: 18 },
    { _id: "p2", name: "Mouse", sku: "MOU-M185", sellingPrice: 500, taxRate: 0 }
];
const warehouses = [{ _id: "w1", name: "Delhi Central", code: "DEL-01" }];

const pendingOrder = {
    order: {
        _id: "o1", orderNumber: "ORD-000005", status: "PENDING", notes: "Call first",
        customer: { name: "Priya Sharma", phone: "9876543210" }, warehouse: { _id: "w1", name: "Delhi Central", code: "DEL-01" }
    },
    items: [{ _id: "i1", product: "p1", quantity: 2 }]
};

const mockApi = (orderResponse) => {
    api.get.mockImplementation((url) => {
        if (url === "/products") return Promise.resolve({ data: { data: { products } } });
        if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses } } });
        return Promise.resolve({ data: { data: orderResponse } });
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    mockApi(pendingOrder);
    api.post.mockResolvedValue({ data: { data: { order: { _id: "o9" } } } });
    api.put.mockResolvedValue({ data: { data: { order: { _id: "o1" } } } });
});

const renderNew = () =>
    renderWithProviders(<OrderFormPage />, { preloadedState: authState("STAFF"), route: "/orders/new", path: "/orders/new" });
const renderEdit = () =>
    renderWithProviders(<OrderFormPage />, { preloadedState: authState("STAFF"), route: "/orders/o1/edit", path: "/orders/:id/edit" });

// Fills the customer name, warehouse and the first product line
const fillBasics = async () => {
    await userEvent.type(screen.getByLabelText("Name"), "Priya Sharma");
    await userEvent.selectOptions(screen.getByLabelText("Warehouse"), "w1");
    await userEvent.selectOptions(screen.getByLabelText("Product 1"), "p1");
};

describe("OrderFormPage — new order", () => {
    test("creates a pending order; only filled-in optional fields are sent", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Laptop Pro/ });

        await fillBasics();
        await userEvent.clear(screen.getByLabelText("Quantity 1"));
        await userEvent.type(screen.getByLabelText("Quantity 1"), "3");
        await userEvent.click(screen.getByRole("button", { name: "Save as pending" }));

        expect(api.post).toHaveBeenCalledWith("/orders", {
            customer: { name: "Priya Sharma" },
            warehouse: "w1",
            items: [{ product: "p1", quantity: 3 }],
            notes: ""
        });
        // …then goes to the new order's page
        expect(await screen.findByText("Another page")).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/orders/o9");
    });

    test("'Save and confirm' asks the server to reserve stock right away", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Laptop Pro/ });

        await fillBasics();
        await userEvent.type(screen.getByLabelText("Phone (optional)"), "9876543210");
        await userEvent.click(screen.getByRole("button", { name: "Save and confirm" }));

        expect(api.post).toHaveBeenCalledWith("/orders", expect.objectContaining({
            customer: { name: "Priya Sharma", phone: "9876543210" },
            confirm: true
        }));
    });

    test("items can be added and removed, and the estimate follows", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Laptop Pro/ });

        // A single line can't be removed
        expect(screen.getByRole("button", { name: "Remove item 1" })).toBeDisabled();

        await userEvent.selectOptions(screen.getByLabelText("Product 1"), "p1");
        await userEvent.clear(screen.getByLabelText("Quantity 1"));
        await userEvent.type(screen.getByLabelText("Quantity 1"), "2");
        // 2 × ₹1,000 = ₹2,000 + 18% tax ₹360
        expect(screen.getByTestId("estimate")).toHaveTextContent("₹2,000.00 + ₹360.00 tax = ₹2,360.00");

        await userEvent.click(screen.getByRole("button", { name: /add item/i }));
        await userEvent.selectOptions(screen.getByLabelText("Product 2"), "p2");
        expect(screen.getByTestId("estimate")).toHaveTextContent("₹2,500.00 + ₹360.00 tax = ₹2,860.00");

        await userEvent.click(screen.getByRole("button", { name: "Remove item 2" }));
        expect(screen.queryByLabelText("Product 2")).not.toBeInTheDocument();
        expect(screen.getByTestId("estimate")).toHaveTextContent("₹2,360.00");
    });

    test("validation: missing fields and duplicate products block the request", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Laptop Pro/ });

        await userEvent.click(screen.getByRole("button", { name: "Save as pending" }));
        expect(await screen.findByText("Customer name must be at least 2 characters")).toBeInTheDocument();
        expect(screen.getByText("Choose a warehouse")).toBeInTheDocument();
        expect(screen.getByText("Choose a product")).toBeInTheDocument();

        await fillBasics();
        await userEvent.click(screen.getByRole("button", { name: /add item/i }));
        await userEvent.selectOptions(screen.getByLabelText("Product 2"), "p1");
        await userEvent.click(screen.getByRole("button", { name: "Save as pending" }));

        expect(await screen.findByText(/Each product can appear only once/)).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("rejects a bad email and phone", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Laptop Pro/ });

        await fillBasics();
        await userEvent.type(screen.getByLabelText("Email (optional)"), "not-an-email");
        await userEvent.type(screen.getByLabelText("Phone (optional)"), "abc");
        await userEvent.click(screen.getByRole("button", { name: "Save as pending" }));

        expect(await screen.findByText("Customer email is not valid")).toBeInTheDocument();
        expect(screen.getByText(/Phone must be 7-20 characters/)).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("shows the server's message and stays on the form when saving fails", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "Only 1 unit(s) of Laptop Pro available in Delhi Central" } } });
        renderNew();
        await screen.findByRole("option", { name: /Laptop Pro/ });

        await fillBasics();
        await userEvent.click(screen.getByRole("button", { name: "Save and confirm" }));

        expect(await screen.findByText(/Only 1 unit\(s\) of Laptop Pro/)).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/orders/new");
    });
});

describe("OrderFormPage — edit order", () => {
    test("loads the pending order into the form and saves changes with PUT", async () => {
        renderEdit();

        expect(await screen.findByText("Edit ORD-000005")).toBeInTheDocument();
        await vi.waitFor(() => expect(screen.getByLabelText("Product 1")).toHaveValue("p1"));
        expect(screen.getByLabelText("Name")).toHaveValue("Priya Sharma");
        expect(screen.getByLabelText("Warehouse")).toHaveValue("w1");
        expect(screen.getByLabelText("Quantity 1")).toHaveValue(2);
        expect(screen.queryByRole("button", { name: "Save and confirm" })).not.toBeInTheDocument();

        await userEvent.clear(screen.getByLabelText("Quantity 1"));
        await userEvent.type(screen.getByLabelText("Quantity 1"), "5");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/orders/o1", {
            customer: { name: "Priya Sharma", phone: "9876543210" },
            warehouse: "w1",
            items: [{ product: "p1", quantity: 5 }],
            notes: "Call first"
        });
        expect(await screen.findByText("Another page")).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/orders/o1");
    });

    test("an order that is no longer pending can't be edited", async () => {
        mockApi({ ...pendingOrder, order: { ...pendingOrder.order, status: "SHIPPED" } });
        renderEdit();

        expect(await screen.findByText(/Only pending orders can be edited/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /back to the order/i })).toHaveAttribute("href", "/orders/o1");
    });

    test("shows an error when the order can't be loaded", async () => {
        api.get.mockImplementation((url) =>
            url === "/orders/o1"
                ? Promise.reject({ response: { data: { message: "Order not found" } } })
                : Promise.resolve({ data: { data: { products, warehouses } } })
        );
        renderEdit();

        expect(await screen.findByText("Order not found")).toBeInTheDocument();
    });
});

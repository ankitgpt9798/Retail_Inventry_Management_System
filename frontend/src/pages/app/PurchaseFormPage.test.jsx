import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PurchaseFormPage from "./PurchaseFormPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const suppliers = [{ _id: "s1", name: "Acme Electronics" }];
const warehouses = [{ _id: "w1", name: "Noida Hub", code: "NOI-01" }];
const products = [
    { _id: "p1", name: "Keyboard", sku: "KEY-K100", costPrice: 400 },
    { _id: "p2", name: "Mouse", sku: "MOU-M185", costPrice: 150 }
];

const draft = {
    _id: "po1", poNumber: "PO-000007", status: "DRAFT", notes: "Urgent", expectedDeliveryDate: "2026-10-15T00:00:00.000Z",
    supplier: { _id: "s1", name: "Acme Electronics" }, warehouse: { _id: "w1", name: "Noida Hub", code: "NOI-01" },
    items: [{ _id: "l1", product: { _id: "p1", name: "Keyboard", sku: "KEY-K100" }, quantityOrdered: 20, quantityReceived: 0, unitCost: 380 }]
};

const mockApi = (purchase = draft) => {
    api.get.mockImplementation((url) => {
        if (url === "/suppliers") return Promise.resolve({ data: { data: { suppliers } } });
        if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses } } });
        if (url === "/products") return Promise.resolve({ data: { data: { products } } });
        return Promise.resolve({ data: { data: { purchase } } });
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
    api.post.mockResolvedValue({ data: { data: { purchase: { _id: "po9" } } } });
    api.put.mockResolvedValue({ data: { data: { purchase: { _id: "po1" } } } });
});

const renderNew = () =>
    renderWithProviders(<PurchaseFormPage />, { preloadedState: authState("INVENTORY_MANAGER"), route: "/purchases/new", path: "/purchases/new" });
const renderEdit = () =>
    renderWithProviders(<PurchaseFormPage />, { preloadedState: authState("INVENTORY_MANAGER"), route: "/purchases/po1/edit", path: "/purchases/:id/edit" });

const fillBasics = async () => {
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "s1");
    await userEvent.selectOptions(screen.getByLabelText("Deliver to warehouse"), "w1");
    await userEvent.selectOptions(screen.getByLabelText("Product 1"), "p1");
};

describe("PurchaseFormPage — new", () => {
    test("saves a draft; empty unit cost and date are left out (the server uses the product's cost)", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Keyboard/ });

        await fillBasics();
        await userEvent.clear(screen.getByLabelText("Quantity 1"));
        await userEvent.type(screen.getByLabelText("Quantity 1"), "20");
        await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

        expect(api.post).toHaveBeenCalledWith("/purchases", {
            supplier: "s1", warehouse: "w1", items: [{ product: "p1", quantityOrdered: 20 }], notes: ""
        });
        expect(await screen.findByText("Another page")).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/purchases/po9");
    });

    test("'Save and submit' sends submit: true, with a unit cost and delivery date when given", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Keyboard/ });

        await fillBasics();
        await userEvent.type(screen.getByLabelText("Unit cost 1"), "380.5");
        await userEvent.type(screen.getByLabelText("Expected delivery date (optional)"), "2026-10-15");
        await userEvent.click(screen.getByRole("button", { name: "Save and submit for approval" }));

        expect(api.post).toHaveBeenCalledWith("/purchases", {
            supplier: "s1", warehouse: "w1", notes: "", expectedDeliveryDate: "2026-10-15",
            items: [{ product: "p1", quantityOrdered: 1, unitCost: 380.5 }], submit: true
        });
    });

    test("the estimated total uses the entered cost, or else the product's cost price", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Keyboard/ });

        await userEvent.selectOptions(screen.getByLabelText("Product 1"), "p1");
        await userEvent.clear(screen.getByLabelText("Quantity 1"));
        await userEvent.type(screen.getByLabelText("Quantity 1"), "10");
        expect(screen.getByTestId("estimate")).toHaveTextContent("₹4,000.00"); // 10 × product cost 400

        await userEvent.type(screen.getByLabelText("Unit cost 1"), "350");
        expect(screen.getByTestId("estimate")).toHaveTextContent("₹3,500.00"); // 10 × entered 350

        await userEvent.click(screen.getByRole("button", { name: /add item/i }));
        await userEvent.selectOptions(screen.getByLabelText("Product 2"), "p2");
        expect(screen.getByTestId("estimate")).toHaveTextContent("₹3,650.00"); // + 1 × 150
    });

    test("validation blocks missing fields and duplicate products", async () => {
        renderNew();
        await screen.findByRole("option", { name: /Keyboard/ });

        await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));
        expect(await screen.findByText("Choose a supplier")).toBeInTheDocument();
        expect(screen.getByText("Choose a warehouse")).toBeInTheDocument();
        expect(screen.getByText("Choose a product")).toBeInTheDocument();

        await fillBasics();
        await userEvent.click(screen.getByRole("button", { name: /add item/i }));
        await userEvent.selectOptions(screen.getByLabelText("Product 2"), "p1");
        await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

        expect(await screen.findByText(/Each product can appear only once/)).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("shows the server's message and stays on the form when saving fails", async () => {
        api.post.mockRejectedValue({ response: { data: { message: 'Supplier "Acme Electronics" is inactive' } } });
        renderNew();
        await screen.findByRole("option", { name: /Keyboard/ });

        await fillBasics();
        await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

        expect(await screen.findByText('Supplier "Acme Electronics" is inactive')).toBeInTheDocument();
        expect(screen.getByTestId("location")).toHaveTextContent("/purchases/new");
    });
});

describe("PurchaseFormPage — edit draft", () => {
    test("loads the draft into the form and saves changes with PUT", async () => {
        renderEdit();

        expect(await screen.findByText("Edit PO-000007")).toBeInTheDocument();
        await vi.waitFor(() => expect(screen.getByLabelText("Product 1")).toHaveValue("p1"));
        expect(screen.getByLabelText("Supplier")).toHaveValue("s1");
        expect(screen.getByLabelText("Quantity 1")).toHaveValue(20);
        expect(screen.getByLabelText("Unit cost 1")).toHaveValue(380);
        expect(screen.getByLabelText("Expected delivery date (optional)")).toHaveValue("2026-10-15");

        await userEvent.clear(screen.getByLabelText("Quantity 1"));
        await userEvent.type(screen.getByLabelText("Quantity 1"), "25");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1", {
            supplier: "s1", warehouse: "w1", notes: "Urgent", expectedDeliveryDate: "2026-10-15",
            items: [{ product: "p1", quantityOrdered: 25, unitCost: 380 }]
        });
        expect(screen.getByTestId("location")).toBeInTheDocument();
        expect(await screen.findByText("Another page")).toBeInTheDocument();
    });

    test("'Save and submit' on a draft saves it, then submits it for approval", async () => {
        renderEdit();
        await screen.findByText("Edit PO-000007");
        await vi.waitFor(() => expect(screen.getByLabelText("Product 1")).toHaveValue("p1"));

        await userEvent.click(screen.getByRole("button", { name: "Save and submit for approval" }));

        await vi.waitFor(() => expect(api.put).toHaveBeenCalledWith("/purchases/po1/submit"));
        expect(api.put).toHaveBeenCalledWith("/purchases/po1", expect.any(Object));
    });

    test("an order that is no longer a draft can't be edited", async () => {
        mockApi({ ...draft, status: "APPROVED" });
        renderEdit();

        expect(await screen.findByText(/Only draft purchase orders can be edited/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    });
});

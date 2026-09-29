import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderDetailPage from "./OrderDetailPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const makeOrder = (status, extra = {}) => ({
    order: {
        _id: "o1", orderNumber: "ORD-000001", status, subtotal: 2000, taxAmount: 360, totalAmount: 2360,
        createdAt: "2026-09-28T10:00:00.000Z", createdBy: { name: "Sunita Rao" },
        customer: { name: "Priya Sharma", email: "priya@example.com", phone: "9876543210", address: "12 MG Road" },
        warehouse: { _id: "w1", name: "Delhi Central", code: "DEL-01" },
        statusHistory: [
            { status: "PENDING", changedAt: "2026-09-28T10:00:00.000Z", changedBy: { name: "Sunita Rao" } },
            { status: "CONFIRMED", changedAt: "2026-09-28T10:05:00.000Z", changedBy: { name: "Sunita Rao" }, note: "Stock reserved" }
        ],
        ...extra
    },
    items: [{ _id: "i1", productName: "Laptop Pro", sku: "LAP-001", unitPrice: 1000, quantity: 2, lineTax: 360, lineTotal: 2360 }]
});

const showOrder = (status, extra) => {
    api.get.mockResolvedValue({ data: { data: makeOrder(status, extra) } });
};

beforeEach(() => {
    vi.clearAllMocks();
});

const renderPage = (role = "STAFF") =>
    renderWithProviders(<OrderDetailPage />, { preloadedState: authState(role), route: "/orders/o1", path: "/orders/:id" });

describe("OrderDetailPage", () => {
    test("shows customer, items, totals, warehouse and the timeline", async () => {
        showOrder("SHIPPED", { carrier: "Blue Dart", trackingNumber: "BD123456" });
        renderPage();

        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/orders/o1");
        expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
        expect(screen.getByText("12 MG Road")).toBeInTheDocument();
        expect(screen.getByText("Laptop Pro")).toBeInTheDocument();
        expect(screen.getByText("₹2,360.00", { selector: "dd" })).toBeInTheDocument();
        expect(screen.getByText("Delhi Central (DEL-01)")).toBeInTheDocument();
        expect(screen.getByText("Blue Dart")).toBeInTheDocument();
        expect(screen.getByText("BD123456")).toBeInTheDocument();
        expect(screen.getByText("Stock reserved")).toBeInTheDocument();
    });

    test("an inventory manager sees the order but no action buttons", async () => {
        showOrder("CONFIRMED");
        renderPage("INVENTORY_MANAGER");

        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /start processing/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });

    test.each([
        ["PENDING", ["Confirm order ORD-000001", "Cancel ORD-000001"], /edit/i],
        ["CONFIRMED", ["Start processing ORD-000001", "Cancel ORD-000001"], null],
        ["PROCESSING", ["Mark packed ORD-000001", "Cancel ORD-000001"], null],
        ["PACKED", ["Ship order ORD-000001", "Cancel ORD-000001"], null],
        ["SHIPPED", ["Mark delivered ORD-000001"], null]
    ])("%s order offers the right next steps", async (status, buttons, editLink) => {
        showOrder(status);
        renderPage();
        await screen.findByText("ORD-000001");

        for (const name of buttons) {
            expect(screen.getByRole("button", { name })).toBeInTheDocument();
        }
        if (editLink) {
            expect(screen.getByRole("link", { name: editLink })).toHaveAttribute("href", "/orders/o1/edit");
        }
        else {
            expect(screen.queryByRole("link", { name: /edit/i })).not.toBeInTheDocument();
        }
        if (status === "SHIPPED") {
            // Goods have left: too late to cancel
            expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
        }
    });

    test("delivered and cancelled orders have no actions", async () => {
        showOrder("DELIVERED");
        const { unmount } = renderPage();
        await screen.findByText("ORD-000001");
        expect(screen.queryByRole("button", { name: /cancel|deliver|ship|process|pack|confirm/i })).not.toBeInTheDocument();
        unmount();

        showOrder("CANCELLED");
        renderPage();
        await screen.findByText("ORD-000001");
        expect(screen.queryByRole("button", { name: /cancel|deliver|ship|process|pack|confirm/i })).not.toBeInTheDocument();
    });

    test("confirming asks first, then reserves stock and reloads the order", async () => {
        showOrder("PENDING");
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Confirm order ORD-000001" }));
        expect(api.put).not.toHaveBeenCalled();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm order" }));

        expect(api.put).toHaveBeenCalledWith("/orders/o1/confirm");
        expect(await screen.findByText("ORD-000001 confirmed.")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledTimes(2); // loaded again to show the new status
    });

    test("confirming shows the server's refusal when stock is short", async () => {
        showOrder("PENDING");
        api.put.mockRejectedValue({ response: { data: { message: "Only 1 unit(s) of Laptop Pro available" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Confirm order ORD-000001" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm order" }));

        expect(await screen.findByText("Only 1 unit(s) of Laptop Pro available")).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("processing / packing / delivering run straight away with the right status", async () => {
        showOrder("CONFIRMED");
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Start processing ORD-000001" }));

        expect(api.put).toHaveBeenCalledWith("/orders/o1/status", { status: "PROCESSING" });
        expect(await screen.findByText("ORD-000001 is now processing.")).toBeInTheDocument();
    });

    test("a refused step shows the server's message under the buttons", async () => {
        showOrder("PROCESSING");
        api.put.mockRejectedValue({ response: { data: { message: "Order ORD-000001 is SHIPPED; it must be PROCESSING to mark it PACKED" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Mark packed ORD-000001" }));

        expect(await screen.findByText(/it must be PROCESSING to mark it PACKED/)).toBeInTheDocument();
    });

    test("shipping needs a carrier and tracking number", async () => {
        showOrder("PACKED");
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Ship order ORD-000001" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));
        expect(await within(dialog).findByText("Carrier must be at least 2 characters")).toBeInTheDocument();
        expect(within(dialog).getByText("Tracking number must be at least 3 characters")).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();

        await userEvent.type(within(dialog).getByLabelText("Carrier"), "Blue Dart");
        await userEvent.type(within(dialog).getByLabelText("Tracking number"), "BD123456");
        await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

        expect(api.put).toHaveBeenCalledWith("/orders/o1/status", { status: "SHIPPED", carrier: "Blue Dart", trackingNumber: "BD123456" });
        expect(await screen.findByText("ORD-000001 shipped.")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("cancelling sends the optional reason with DELETE", async () => {
        showOrder("CONFIRMED");
        api.delete.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Cancel ORD-000001" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Reason (optional)"), "Customer changed mind");
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));

        expect(api.delete).toHaveBeenCalledWith("/orders/o1", { data: { reason: "Customer changed mind" } });
        expect(await screen.findByText("ORD-000001 cancelled.")).toBeInTheDocument();
    });

    test("cancelling without a reason sends an empty body", async () => {
        showOrder("PENDING");
        api.delete.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Cancel ORD-000001" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel order" }));

        expect(api.delete).toHaveBeenCalledWith("/orders/o1", { data: {} });
    });

    test("shows an error and a way back when the order doesn't exist", async () => {
        api.get.mockRejectedValue({ response: { data: { message: "Order not found" } } });
        renderPage();

        expect(await screen.findByText("Order not found")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /back to orders/i })).toHaveAttribute("href", "/orders");
    });
});

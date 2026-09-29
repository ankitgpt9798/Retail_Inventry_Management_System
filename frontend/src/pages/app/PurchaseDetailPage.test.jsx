import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PurchaseDetailPage from "./PurchaseDetailPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

// The logged-in user (from authState) has _id "u1"
const makePurchase = (status, extra = {}) => ({
    _id: "po1", poNumber: "PO-000001", status, totalAmount: 20000, createdAt: "2026-09-28T10:00:00.000Z",
    requestedBy: { _id: "someone-else", name: "Neha Singh" },
    supplier: { _id: "s1", name: "Acme Electronics" }, warehouse: { _id: "w1", name: "Noida Hub", code: "NOI-01" },
    items: [
        { _id: "l1", product: { _id: "p1", name: "Keyboard", sku: "KEY-K100" }, unitCost: 400, quantityOrdered: 30, quantityReceived: 10, quantityOutstanding: 20 },
        { _id: "l2", product: { _id: "p2", name: "Mouse", sku: "MOU-M185" }, unitCost: 150, quantityOrdered: 5, quantityReceived: 5, quantityOutstanding: 0 }
    ],
    ...extra
});

const showPurchase = (status, extra) => {
    api.get.mockResolvedValue({ data: { data: { purchase: makePurchase(status, extra) } } });
};

beforeEach(() => {
    vi.clearAllMocks();
    api.put.mockResolvedValue({ data: {} });
});

const renderPage = (role = "INVENTORY_MANAGER") =>
    renderWithProviders(<PurchaseDetailPage />, { preloadedState: authState(role), route: "/purchases/po1", path: "/purchases/:id" });

describe("PurchaseDetailPage — details", () => {
    test("shows items with ordered / received / outstanding, supplier, warehouse and the timeline", async () => {
        showPurchase("PARTIALLY_RECEIVED", {
            approvedAt: "2026-09-28T11:00:00.000Z", approvedBy: { name: "Ravi Kumar" },
            orderedAt: "2026-09-28T12:00:00.000Z", orderedBy: { name: "Ravi Kumar" },
            deliveryNote: "Two boxes tomorrow"
        });
        renderPage();

        expect(await screen.findByText("PO-000001")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/purchases/po1");
        const keyboardRow = screen.getByText("Keyboard").closest("tr");
        expect(within(keyboardRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
            expect.stringContaining("Keyboard"), "₹400.00", "30", "10", "20"
        ]);
        expect(screen.getByText("Acme Electronics")).toBeInTheDocument();
        expect(screen.getByText("Noida Hub (NOI-01)")).toBeInTheDocument();
        expect(screen.getByText("Two boxes tomorrow")).toBeInTheDocument();
        expect(screen.getByText("Approved")).toBeInTheDocument();
        expect(screen.getByText("Sent to supplier")).toBeInTheDocument();
        expect(screen.queryByText("Cancelled", { selector: "div.font-medium" })).not.toBeInTheDocument();
    });

    test("shows an error and a way back when the order doesn't exist", async () => {
        api.get.mockRejectedValue({ response: { data: { message: "Purchase order not found" } } });
        renderPage();

        expect(await screen.findByText("Purchase order not found")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /back to purchase orders/i })).toHaveAttribute("href", "/purchases");
    });
});

describe("PurchaseDetailPage — manager actions", () => {
    test.each([
        ["DRAFT", ["Submit for approval", "Cancel order"], ["Approve", "Receive goods"]],
        ["PENDING", ["Approve", "Reject", "Cancel order"], ["Submit for approval", "Mark as ordered"]],
        ["APPROVED", ["Mark as ordered", "Cancel order"], ["Approve", "Receive goods"]],
        ["ORDERED", ["Receive goods", "Cancel order"], ["Mark as ordered", "Confirm order"]],
        ["PARTIALLY_RECEIVED", ["Receive goods", "Cancel the rest"], ["Cancel order"]],
        ["RECEIVED", [], ["Receive goods", "Cancel order", "Approve"]],
        ["REJECTED", [], ["Approve", "Cancel order"]],
        ["CANCELLED", [], ["Receive goods", "Cancel order"]]
    ])("%s shows the right buttons", async (status, shown, hidden) => {
        showPurchase(status);
        renderPage();
        await screen.findByText("PO-000001");

        for (const name of shown) {
            expect(screen.getByRole("button", { name })).toBeInTheDocument();
        }
        for (const name of hidden) {
            expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
        }
    });

    test("a draft can be edited", async () => {
        showPurchase("DRAFT");
        renderPage();

        expect(await screen.findByRole("link", { name: /edit/i })).toHaveAttribute("href", "/purchases/po1/edit");
    });

    test("you can't approve or reject your own request", async () => {
        showPurchase("PENDING", { requestedBy: { _id: "u1", name: "Ravi Kumar" } });
        renderPage();
        await screen.findByText("PO-000001");

        expect(screen.getByText("Needs another approver")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    });

    test("submit and approve run straight away and reload the order", async () => {
        showPurchase("PENDING");
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Approve" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/approve");
        expect(await screen.findByText("PO-000001 approved.")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    test("shows the server's message when a step is refused", async () => {
        showPurchase("DRAFT");
        api.put.mockRejectedValue({ response: { data: { message: "Purchase order PO-000001 is no longer a DRAFT" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Submit for approval" }));

        expect(await screen.findByText("Purchase order PO-000001 is no longer a DRAFT")).toBeInTheDocument();
    });

    test("reject needs a reason", async () => {
        showPurchase("PENDING");
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
        expect(await within(dialog).findByText(/give a reason/i)).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();

        await userEvent.type(within(dialog).getByLabelText("Reason for rejecting"), "Too expensive");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/reject", { reason: "Too expensive" });
        expect(await screen.findByText("PO-000001 rejected.")).toBeInTheDocument();
    });

    test("marking as ordered asks first because the supplier will see it", async () => {
        showPurchase("APPROVED");
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Mark as ordered" }));
        expect(api.put).not.toHaveBeenCalled();
        expect(screen.getByText(/will be sent to Acme Electronics/)).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as ordered" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/order");
        expect(await screen.findByText("PO-000001 sent to the supplier.")).toBeInTheDocument();
    });

    test("cancel sends the optional reason", async () => {
        showPurchase("ORDERED");
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Reason (optional)"), "Found a cheaper supplier");
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/cancel", { reason: "Found a cheaper supplier" });
        expect(await screen.findByText("PO-000001 cancelled.")).toBeInTheDocument();
    });

    test("'Cancel the rest' explains that received goods stay in stock", async () => {
        showPurchase("PARTIALLY_RECEIVED");
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Cancel the rest" }));

        expect(screen.getByText("Goods already received stay in stock.")).toBeInTheDocument();
    });
});

describe("PurchaseDetailPage — receiving goods", () => {
    const openReceive = async () => {
        showPurchase("PARTIALLY_RECEIVED");
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Receive goods" }));
        return screen.getByRole("dialog");
    };

    test("lists only lines with units still outstanding", async () => {
        const dialog = await openReceive();

        expect(within(dialog).getByLabelText("Received quantity for Keyboard")).toBeInTheDocument();
        // The mouse line is complete (5 of 5)
        expect(within(dialog).queryByLabelText("Received quantity for Mouse")).not.toBeInTheDocument();
    });

    test("sends only the lines that arrived", async () => {
        const dialog = await openReceive();

        await userEvent.type(within(dialog).getByLabelText("Received quantity for Keyboard"), "12");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record delivery" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/receive", { items: [{ product: "p1", quantity: 12 }] });
        expect(await screen.findByText("Goods received for PO-000001.")).toBeInTheDocument();
    });

    test("needs at least one quantity and never more than is outstanding", async () => {
        const dialog = await openReceive();

        await userEvent.click(within(dialog).getByRole("button", { name: "Record delivery" }));
        expect(await within(dialog).findByText("Enter the quantity received for at least one item")).toBeInTheDocument();

        await userEvent.type(within(dialog).getByLabelText("Received quantity for Keyboard"), "21");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record delivery" }));
        expect(await within(dialog).findByText("Only 20 unit(s) of Keyboard are still expected")).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();
    });

    test("shows the server's message when the delivery is refused (e.g. warehouse full)", async () => {
        api.put.mockRejectedValue({ response: { data: { message: "Noida Hub does not have enough free capacity" } } });
        const dialog = await openReceive();

        await userEvent.type(within(dialog).getByLabelText("Received quantity for Keyboard"), "5");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record delivery" }));

        expect(await within(dialog).findByText("Noida Hub does not have enough free capacity")).toBeInTheDocument();
    });
});

describe("PurchaseDetailPage — supplier portal", () => {
    test("a supplier can confirm a new order, optionally with a date and note", async () => {
        showPurchase("ORDERED");
        renderPage("SUPPLIER");

        await userEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Expected delivery date"), "2026-10-20");
        await userEvent.type(within(dialog).getByLabelText("Delivery note"), "Ships Monday");
        await userEvent.click(within(dialog).getByRole("button", { name: "Confirm order" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/confirm", { expectedDeliveryDate: "2026-10-20", deliveryNote: "Ships Monday" });
        expect(await screen.findByText("PO-000001 confirmed.")).toBeInTheDocument();
    });

    test("confirming with nothing filled in sends an empty body", async () => {
        showPurchase("ORDERED");
        renderPage("SUPPLIER");

        await userEvent.click(await screen.findByRole("button", { name: "Confirm order" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm order" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/confirm", {});
    });

    test("an already confirmed order can only have its delivery details updated", async () => {
        showPurchase("ORDERED", { supplierConfirmedAt: "2026-09-29T09:00:00.000Z" });
        renderPage("SUPPLIER");

        expect(await screen.findByRole("button", { name: "Update delivery details" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Confirm order" })).not.toBeInTheDocument();
    });

    test("updating delivery details needs a date or a note", async () => {
        showPurchase("PARTIALLY_RECEIVED", { supplierConfirmedAt: "2026-09-29T09:00:00.000Z" });
        renderPage("SUPPLIER");

        await userEvent.click(await screen.findByRole("button", { name: "Update delivery details" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("Provide an expected delivery date or a delivery note")).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();

        await userEvent.type(within(dialog).getByLabelText("Delivery note"), "Rest arrives Friday");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        expect(api.put).toHaveBeenCalledWith("/purchases/po1/delivery", { deliveryNote: "Rest arrives Friday" });
        expect(await screen.findByText("Delivery details updated.")).toBeInTheDocument();
    });

    test("a supplier never sees the buyer's workflow buttons", async () => {
        showPurchase("ORDERED");
        renderPage("SUPPLIER");
        await screen.findByText("PO-000001");

        for (const name of ["Receive goods", "Cancel order", "Approve", "Mark as ordered"]) {
            expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
        }
    });

    test("a supplier has no actions once the order is received", async () => {
        showPurchase("RECEIVED");
        renderPage("SUPPLIER");
        await screen.findByText("PO-000001");

        expect(screen.queryByRole("button", { name: /confirm|delivery/i })).not.toBeInTheDocument();
    });
});

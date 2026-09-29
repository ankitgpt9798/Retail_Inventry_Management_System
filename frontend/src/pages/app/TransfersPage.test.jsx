import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransfersPage from "./TransfersPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const products = [{ _id: "p1", name: "Laptop Pro", sku: "LAP-001" }];
const warehouses = [
    { _id: "w1", name: "Delhi Central", code: "DEL-01" },
    { _id: "w2", name: "Noida Hub", code: "NOI-01" }
];

// The logged-in user (from authState) has _id "u1"
const makeTransfer = (id, status, extra = {}) => ({
    _id: id, transferNumber: `TRF-00000${id.slice(1)}`, status, quantity: 10, createdAt: "2026-09-28T10:00:00.000Z",
    product: { _id: "p1", name: "Laptop Pro", sku: "LAP-001" },
    fromWarehouse: { _id: "w1", name: "Delhi Central", code: "DEL-01" },
    toWarehouse: { _id: "w2", name: "Noida Hub", code: "NOI-01" },
    requestedBy: { _id: "someone-else", name: "Neha Singh" },
    ...extra
});

const showTransfers = (transfers) => {
    api.get.mockImplementation((url) => {
        if (url === "/products") return Promise.resolve({ data: { data: { products } } });
        if (url === "/warehouses") return Promise.resolve({ data: { data: { warehouses } } });
        return Promise.resolve({ data: { data: { transfers, pagination: { page: 1, limit: 10, total: transfers.length, totalPages: 1 } } } });
    });
};

beforeEach(() => {
    vi.clearAllMocks();
});

const renderPage = (role = "INVENTORY_MANAGER") =>
    renderWithProviders(<TransfersPage />, { preloadedState: authState(role), route: "/transfers", path: "/transfers" });

describe("TransfersPage", () => {
    test("lists transfers with route, quantity and status", async () => {
        showTransfers([makeTransfer("t1", "REQUESTED")]);
        renderPage();

        expect(await screen.findByText("TRF-000001")).toBeInTheDocument();
        // (scoped to the row: "Requested" is also an option in the status filter)
        const row = screen.getByText("TRF-000001").closest("tr");
        expect(within(row).getByText("Requested")).toBeInTheDocument();
        expect(screen.getByText(/DEL-01/)).toBeInTheDocument();
        expect(screen.getByText(/NOI-01/)).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/transfers", { params: { page: 1, limit: 10 } });
    });

    test("the status filter is sent to the API", async () => {
        showTransfers([makeTransfer("t1", "REQUESTED")]);
        renderPage();
        await screen.findByText("TRF-000001");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "DISPATCHED");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/transfers", { params: { status: "DISPATCHED", page: 1, limit: 10 } })
        );
    });

    test("each status offers only its next steps", async () => {
        showTransfers([
            makeTransfer("t1", "REQUESTED"),
            makeTransfer("t2", "APPROVED"),
            makeTransfer("t3", "DISPATCHED"),
            makeTransfer("t4", "RECEIVED")
        ]);
        renderPage();
        await screen.findByText("TRF-000001");

        expect(screen.getByRole("button", { name: "Approve TRF-000001" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reject TRF-000001" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel TRF-000001" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Dispatch TRF-000002" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel TRF-000002" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve TRF-000002" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Receive TRF-000003" })).toBeInTheDocument();
        // Goods already on the way can't be cancelled; finished transfers have no actions
        expect(screen.queryByRole("button", { name: "Cancel TRF-000003" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /TRF-000004/ })).not.toBeInTheDocument();
    });

    test("you can't approve or reject your own request", async () => {
        showTransfers([makeTransfer("t1", "REQUESTED", { requestedBy: { _id: "u1", name: "Ravi Kumar" } })]);
        renderPage();
        await screen.findByText("TRF-000001");

        expect(screen.getByText("Needs another approver")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve TRF-000001" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Reject TRF-000001" })).not.toBeInTheDocument();
        // ...but you may still cancel it
        expect(screen.getByRole("button", { name: "Cancel TRF-000001" })).toBeInTheDocument();
    });

    test("approve runs straight away", async () => {
        showTransfers([makeTransfer("t1", "REQUESTED")]);
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Approve TRF-000001" }));

        expect(api.put).toHaveBeenCalledWith("/transfers/t1/approve", undefined);
        expect(await screen.findByText("TRF-000001 approved.")).toBeInTheDocument();
    });

    test("shows the server's reason when approving is refused (e.g. not enough stock)", async () => {
        showTransfers([makeTransfer("t1", "REQUESTED")]);
        api.put.mockRejectedValue({ response: { data: { message: "Only 4 unit(s) available in Delhi Central" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Approve TRF-000001" }));

        expect(await screen.findByText("Only 4 unit(s) available in Delhi Central")).toBeInTheDocument();
    });

    test("reject needs a reason", async () => {
        showTransfers([makeTransfer("t1", "REQUESTED")]);
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Reject TRF-000001" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reject transfer" }));
        expect(await within(dialog).findByText(/give a reason/i)).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();

        await userEvent.type(within(dialog).getByLabelText("Reason for rejecting"), "Not needed");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reject transfer" }));

        expect(api.put).toHaveBeenCalledWith("/transfers/t1/reject", { reason: "Not needed" });
        expect(await screen.findByText("TRF-000001 rejected.")).toBeInTheDocument();
    });

    test("cancel works with or without a reason", async () => {
        showTransfers([makeTransfer("t1", "APPROVED")]);
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Cancel TRF-000001" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel transfer" }));

        expect(api.put).toHaveBeenCalledWith("/transfers/t1/cancel", {});
        expect(await screen.findByText("TRF-000001 cancelled.")).toBeInTheDocument();
    });

    test("dispatch and receive ask for confirmation because they move stock", async () => {
        showTransfers([makeTransfer("t1", "APPROVED"), makeTransfer("t2", "DISPATCHED")]);
        api.put.mockResolvedValue({ data: {} });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Dispatch TRF-000001" }));
        expect(api.put).not.toHaveBeenCalled();
        expect(screen.getByText(/will be taken out of Delhi Central/)).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dispatch" }));
        expect(api.put).toHaveBeenCalledWith("/transfers/t1/dispatch", undefined);
        expect(await screen.findByText("TRF-000001 dispatched.")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Receive TRF-000002" }));
        expect(screen.getByText(/will be added to Noida Hub/)).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Receive" }));
        expect(api.put).toHaveBeenCalledWith("/transfers/t2/receive", undefined);
    });

    test("receive shows the server's message when it fails (e.g. destination is full)", async () => {
        showTransfers([makeTransfer("t1", "DISPATCHED")]);
        api.put.mockRejectedValue({ response: { data: { message: "Noida Hub does not have enough free capacity" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Receive TRF-000001" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Receive" }));

        expect(await screen.findByText("Noida Hub does not have enough free capacity")).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("creates a transfer request", async () => {
        showTransfers([]);
        api.post.mockResolvedValue({ data: {} });
        renderPage();
        await screen.findByText("No transfers found.");

        await userEvent.click(screen.getByRole("button", { name: /new transfer/i }));
        const dialog = screen.getByRole("dialog");
        await userEvent.selectOptions(within(dialog).getByLabelText("Product"), "p1");
        await userEvent.selectOptions(within(dialog).getByLabelText("From warehouse"), "w1");
        await userEvent.selectOptions(within(dialog).getByLabelText("To warehouse"), "w2");
        await userEvent.clear(within(dialog).getByLabelText("Quantity"));
        await userEvent.type(within(dialog).getByLabelText("Quantity"), "10");
        await userEvent.click(within(dialog).getByRole("button", { name: "Request transfer" }));

        expect(api.post).toHaveBeenCalledWith("/transfers", {
            product: "p1", fromWarehouse: "w1", toWarehouse: "w2", quantity: 10, notes: ""
        });
        expect(await screen.findByText("Transfer requested.")).toBeInTheDocument();
    });

    test("the form refuses the same warehouse twice, without calling the API", async () => {
        showTransfers([]);
        renderPage();
        await screen.findByText("No transfers found.");

        await userEvent.click(screen.getByRole("button", { name: /new transfer/i }));
        const dialog = screen.getByRole("dialog");
        await userEvent.selectOptions(within(dialog).getByLabelText("Product"), "p1");
        await userEvent.selectOptions(within(dialog).getByLabelText("From warehouse"), "w1");
        await userEvent.selectOptions(within(dialog).getByLabelText("To warehouse"), "w1");
        await userEvent.click(within(dialog).getByRole("button", { name: "Request transfer" }));

        expect(await within(dialog).findByText("Source and destination warehouse cannot be the same")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });
});

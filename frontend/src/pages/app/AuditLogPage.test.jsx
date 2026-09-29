import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditLogPage from "./AuditLogPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const logs = [
    {
        _id: "a1", action: "PRODUCT_UPDATED", entityType: "Product", entityId: "665f1c2e9b1d4a0012345678", createdAt: "2026-09-28T10:00:00.000Z",
        user: { _id: "u1", name: "Ravi Kumar", email: "ravi@shop.com", role: "ADMIN" },
        oldValue: { sellingPrice: 949, name: "Keyboard" }, newValue: { sellingPrice: 999 }
    },
    {
        _id: "a2", action: "STOCK_TRANSFER_DISPATCHED", entityType: "StockTransfer", entityId: "665f1c2e9b1d4a00123456aa", createdAt: "2026-09-27T09:00:00.000Z",
        user: null, oldValue: null, newValue: null, metadata: { quantity: 10 }
    },
    {
        _id: "a3", action: "USER_LOGIN", entityType: "User", entityId: "665f1c2e9b1d4a00123456bb", createdAt: "2026-09-26T09:00:00.000Z",
        user: { _id: "u1", name: "Ravi Kumar", email: "ravi@shop.com", role: "ADMIN" }
    }
];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
        if (url === "/audit-logs/filters") return Promise.resolve({ data: { data: { actions: ["PRODUCT_UPDATED", "USER_LOGIN"], entityTypes: ["Product", "StockTransfer", "User"] } } });
        if (url === "/users") return Promise.resolve({ data: { data: { users: [{ _id: "u1", name: "Ravi Kumar" }] } } });
        return Promise.resolve({ data: { data: { auditLogs: logs, pagination: { page: 1, limit: 15, total: 3, totalPages: 1 } } } });
    });
});

const renderPage = () => renderWithProviders(<AuditLogPage />, { preloadedState: authState("ADMIN"), route: "/audit-logs", path: "/audit-logs" });

describe("AuditLogPage", () => {
    test("lists who did what, in plain words", async () => {
        renderPage();

        expect(await screen.findByText("Product updated", { selector: "td" })).toBeInTheDocument();
        expect(screen.getByText("Stock transfer dispatched", { selector: "td" })).toBeInTheDocument();
        expect(screen.getByText("Stock transfer", { selector: "td div" })).toBeInTheDocument(); // "StockTransfer" made readable
        expect(screen.getAllByText("Ravi Kumar").length).toBeGreaterThan(0);
        expect(screen.getByText("12345678")).toBeInTheDocument(); // the last 8 characters of the record id
        expect(api.get).toHaveBeenCalledWith("/audit-logs", { params: { sort: "newest", page: 1, limit: 15 } });
    });

    test("an action without a user is shown as 'System'", async () => {
        renderPage();
        await screen.findByText("Product updated", { selector: "td" });

        expect(within(screen.getByText("Stock transfer dispatched").closest("tr")).getByText("System")).toBeInTheDocument();
    });

    test("filter lists come from what is really in the log", async () => {
        renderPage();
        await screen.findByText("Product updated", { selector: "td" });

        const action = screen.getByRole("combobox", { name: "Action" });
        expect(within(action).getByRole("option", { name: "User login" })).toBeInTheDocument();
        const type = screen.getByRole("combobox", { name: "Record type" });
        expect(within(type).getByRole("option", { name: "Stock transfer" })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/audit-logs/filters");
    });

    test("action, record type, user, dates and order are sent to the API", async () => {
        renderPage();
        await screen.findByText("Product updated", { selector: "td" });

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Action" }), "PRODUCT_UPDATED");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Record type" }), "Product");
        await userEvent.selectOptions(await screen.findByRole("option", { name: "Ravi Kumar" }).then((option) => option.closest("select")), "u1");
        await userEvent.type(screen.getByLabelText("From"), "2026-09-01");
        await userEvent.type(screen.getByLabelText("To"), "2026-09-28");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Order" }), "oldest");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/audit-logs", {
                params: { action: "PRODUCT_UPDATED", entityType: "Product", user: "u1", from: "2026-09-01", to: "2026-09-28", sort: "oldest", page: 1, limit: 15 }
            })
        );
    });

    test("details show each changed field before and after", async () => {
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Show details: Product updated" }));

        const details = screen.getAllByRole("table")[1];
        expect(within(details).getByText("sellingPrice")).toBeInTheDocument();
        expect(within(within(details).getByText("sellingPrice").closest("tr")).getByText("949")).toBeInTheDocument();
        expect(within(within(details).getByText("sellingPrice").closest("tr")).getByText("999")).toBeInTheDocument();
        // A field that only exists before: shown, with "—" after
        expect(within(within(details).getByText("name").closest("tr")).getByText("—")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Hide details: Product updated" }));
        expect(screen.getAllByRole("table")).toHaveLength(1);
    });

    test("extra details (metadata) are shown; rows with nothing extra have no Details button", async () => {
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Show details: Stock transfer dispatched" }));
        expect(screen.getByText(/Extra details:/)).toBeInTheDocument();
        expect(screen.getByText(/"quantity":10/)).toBeInTheDocument();

        expect(screen.queryByRole("button", { name: "Show details: User login" })).not.toBeInTheDocument();
    });

    test("only one row's details are open at a time", async () => {
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Show details: Product updated" }));
        await userEvent.click(screen.getByRole("button", { name: "Show details: Stock transfer dispatched" }));

        expect(screen.getByRole("button", { name: "Show details: Product updated" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Hide details: Stock transfer dispatched" })).toBeInTheDocument();
    });

    test("it has no edit or delete controls: the log is read-only", async () => {
        renderPage();
        await screen.findByText("Product updated", { selector: "td" });

        expect(screen.queryByRole("button", { name: /edit|delete|remove/i })).not.toBeInTheDocument();
    });

    test("shows an error with a retry button when loading fails", async () => {
        let fail = true;
        api.get.mockImplementation((url) => {
            if (url === "/audit-logs/filters") return Promise.resolve({ data: { data: { actions: [], entityTypes: [] } } });
            if (url === "/users") return Promise.resolve({ data: { data: { users: [] } } });
            if (fail) {
                fail = false;
                return Promise.reject({ response: { data: { message: "from cannot be after to" } } });
            }
            return Promise.resolve({ data: { data: { auditLogs: logs, pagination: { page: 1, limit: 15, total: 3, totalPages: 1 } } } });
        });
        renderPage();

        expect(await screen.findByText("from cannot be after to")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Product updated", { selector: "td" })).toBeInTheDocument();
    });
});

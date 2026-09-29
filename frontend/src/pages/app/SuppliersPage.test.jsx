import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuppliersPage from "./SuppliersPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const acme = { _id: "s1", name: "Acme Electronics", email: "sales@acme.in", contactPerson: "Suresh", phone: "9876543210", city: "Delhi", status: "ACTIVE" };
const bharat = { _id: "s2", name: "Bharat Foods", email: "hello@bharat.in", contactPerson: "", phone: "", city: "", status: "INACTIVE" };

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: { suppliers: [acme, bharat], pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } } });
});

const renderPage = (role = "INVENTORY_MANAGER") =>
    renderWithProviders(<SuppliersPage />, { preloadedState: authState(role), route: "/suppliers", path: "/suppliers" });

describe("SuppliersPage", () => {
    test("lists suppliers with contact details and status", async () => {
        renderPage();

        expect(await screen.findByText("Acme Electronics")).toBeInTheDocument();
        expect(screen.getByText("sales@acme.in")).toBeInTheDocument();
        expect(screen.getByText("Suresh")).toBeInTheDocument();
        expect(within(screen.getByText("Bharat Foods").closest("tr")).getByText("Inactive")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/suppliers", { params: { page: 1, limit: 10 } });
    });

    test("search and status filters are sent to the API", async () => {
        renderPage();
        await screen.findByText("Acme Electronics");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "ACTIVE");
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "acme");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/suppliers", { params: { search: "acme", status: "ACTIVE", page: 1, limit: 10 } })
        );
    });

    test("creates a supplier; an empty phone is not sent", async () => {
        api.post.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Acme Electronics");

        await userEvent.click(screen.getByRole("button", { name: /new supplier/i }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Company name"), "Zen Traders");
        await userEvent.type(within(dialog).getByLabelText("Email"), "zen@traders.in");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create supplier" }));

        expect(api.post).toHaveBeenCalledWith("/suppliers", { name: "Zen Traders", contactPerson: "", email: "zen@traders.in", city: "", address: "" });
        expect(await screen.findByText("Supplier created.")).toBeInTheDocument();
    });

    test("the form validates name, email and phone", async () => {
        renderPage();
        await screen.findByText("Acme Electronics");

        await userEvent.click(screen.getByRole("button", { name: /new supplier/i }));
        await userEvent.type(screen.getByLabelText("Email"), "nope");
        await userEvent.type(screen.getByLabelText("Phone (optional)"), "abc");
        await userEvent.click(screen.getByRole("button", { name: "Create supplier" }));

        expect(await screen.findByText("Supplier name must be at least 2 characters")).toBeInTheDocument();
        expect(screen.getByText("Email is not valid")).toBeInTheDocument();
        expect(screen.getByText(/Phone must be 7-20 characters/)).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("edits a supplier (form is pre-filled)", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage();
        await screen.findByText("Acme Electronics");

        await userEvent.click(screen.getByRole("button", { name: "Edit Acme Electronics" }));
        expect(screen.getByLabelText("Company name")).toHaveValue("Acme Electronics");
        expect(screen.getByLabelText("Phone (optional)")).toHaveValue("9876543210");
        await userEvent.clear(screen.getByLabelText("City (optional)"));
        await userEvent.type(screen.getByLabelText("City (optional)"), "Noida");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/suppliers/s1", expect.objectContaining({ name: "Acme Electronics", city: "Noida", phone: "9876543210" }));
        expect(await screen.findByText("Supplier updated.")).toBeInTheDocument();
    });

    test("deactivating asks first and reports how many portal logins were switched off", async () => {
        api.delete.mockResolvedValue({ data: { data: { supplier: acme, deactivatedUserCount: 2 } } });
        renderPage();
        await screen.findByText("Acme Electronics");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Acme Electronics" }));
        expect(api.delete).not.toHaveBeenCalled();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(api.delete).toHaveBeenCalledWith("/suppliers/s1");
        expect(await screen.findByText("Supplier deactivated. 2 portal login(s) were deactivated too.")).toBeInTheDocument();
    });

    test("shows the server's reason when a supplier with open purchase orders can't be deactivated", async () => {
        api.delete.mockRejectedValue({ response: { data: { message: "Cannot deactivate: 1 open purchase order(s) with this supplier." } } });
        renderPage();
        await screen.findByText("Acme Electronics");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Acme Electronics" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(await screen.findByText(/1 open purchase order/)).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("reactivates an inactive supplier", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage();
        await screen.findByText("Bharat Foods");

        await userEvent.click(screen.getByRole("button", { name: "Reactivate Bharat Foods" }));

        expect(api.put).toHaveBeenCalledWith("/suppliers/s2", { status: "ACTIVE" });
        expect(await screen.findByText("Supplier reactivated.")).toBeInTheDocument();
    });
});

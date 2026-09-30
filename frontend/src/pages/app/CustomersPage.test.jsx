import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomersPage from "./CustomersPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const customers = [
    {
        key: "asha@example.com", name: "Asha Rao", email: "asha@example.com", phone: "98100 11111", address: "12 MG Road, Delhi",
        orderCount: 3, openOrders: 1, totalSpent: 45210.5, firstOrderAt: "2026-03-01T10:00:00.000Z",
        lastOrderAt: "2026-09-20T10:00:00.000Z", lastOrderNumber: "ORD-000042"
    },
    {
        key: "Vikram|98290", name: "Vikram Singh", email: null, phone: "98290", address: null,
        orderCount: 1, openOrders: 0, totalSpent: 0, firstOrderAt: "2026-05-01T10:00:00.000Z",
        lastOrderAt: "2026-05-01T10:00:00.000Z", lastOrderNumber: "ORD-000010"
    }
];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: { customers, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } } });
});

const renderPage = (route = "/customers") =>
    renderWithProviders(<CustomersPage />, { preloadedState: authState("STAFF"), route, path: "/customers" });

describe("CustomersPage", () => {
    test("shows each customer as a card with orders, spend and last order", async () => {
        renderPage();

        const asha = await screen.findByRole("article", { name: "Asha Rao" });
        expect(within(asha).getByText("asha@example.com")).toBeInTheDocument();
        expect(within(asha).getByText("₹45,210.50")).toBeInTheDocument();
        expect(within(asha).getByText("1 open")).toBeInTheDocument();
        expect(within(asha).getByText(/ORD-000042/)).toBeInTheDocument();
        expect(within(screen.getByRole("article", { name: "Vikram Singh" })).getByText("No email on file")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/customers", { params: { sort: "recent", page: 1, limit: 10 } });
    });

    test("'View orders' opens the orders list searched for that customer", async () => {
        renderPage();

        const link = await screen.findByRole("link", { name: "View orders of Asha Rao" });
        expect(link).toHaveAttribute("href", "/orders?search=asha%40example.com");
        // no email → the phone number is used
        expect(screen.getByRole("link", { name: "View orders of Vikram Singh" })).toHaveAttribute("href", "/orders?search=98290");
    });

    test("search and sort are sent to the API", async () => {
        renderPage();
        await screen.findByText("Asha Rao");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "spent_high");
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "asha");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/customers", { params: { search: "asha", sort: "spent_high", page: 1, limit: 10 } })
        );
    });

    test("it is read-only: no create, edit or delete buttons", async () => {
        renderPage();
        await screen.findByText("Asha Rao");

        expect(screen.queryByRole("button", { name: /new|edit|delete|deactivate/i })).not.toBeInTheDocument();
    });
});

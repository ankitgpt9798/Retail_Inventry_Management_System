import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FulfillmentPage from "./FulfillmentPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const makeOrder = (id, number, status) => ({
    _id: id, orderNumber: number, status, totalAmount: 2360, customer: { name: "Priya Sharma" }, warehouse: { code: "DEL-01" }
});

// The queue counts, and the orders at each stage
const queue = { CONFIRMED: 2, PROCESSING: 1, PACKED: 0, SHIPPED: 3 };
const ordersByStatus = {
    CONFIRMED: [makeOrder("o1", "ORD-000001", "CONFIRMED"), makeOrder("o2", "ORD-000002", "CONFIRMED")],
    PROCESSING: [makeOrder("o3", "ORD-000003", "PROCESSING")],
    PACKED: [],
    SHIPPED: [makeOrder("o4", "ORD-000004", "SHIPPED")]
};

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url, config) => {
        if (url === "/orders/fulfillment-queue") return Promise.resolve({ data: { data: { queue } } });
        const orders = ordersByStatus[config.params.status];
        return Promise.resolve({ data: { data: { orders, pagination: { page: 1, limit: 10, total: orders.length, totalPages: 1 } } } });
    });
});

const renderPage = (role = "STAFF") =>
    renderWithProviders(<FulfillmentPage />, { preloadedState: authState(role), route: "/fulfillment", path: "/fulfillment" });

describe("FulfillmentPage", () => {
    test("shows how many orders wait at each stage and lists the first stage", async () => {
        renderPage();

        expect(await screen.findByTestId("queue-CONFIRMED")).toHaveTextContent("2");
        expect(screen.getByTestId("queue-PROCESSING")).toHaveTextContent("1");
        expect(screen.getByTestId("queue-PACKED")).toHaveTextContent("0");
        expect(screen.getByTestId("queue-SHIPPED")).toHaveTextContent("3");
        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
        expect(screen.getByText("ORD-000002")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/orders", { params: { status: "CONFIRMED", page: 1, limit: 10 } });
    });

    test("clicking a stage lists that stage's orders with that stage's next step", async () => {
        renderPage();
        await screen.findByText("ORD-000001");

        await userEvent.click(screen.getByRole("button", { name: /^processing/i }));

        expect(await screen.findByText("ORD-000003")).toBeInTheDocument();
        expect(screen.queryByText("ORD-000001")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Mark packed ORD-000003" })).toBeInTheDocument();
        expect(api.get).toHaveBeenLastCalledWith("/orders", { params: { status: "PROCESSING", page: 1, limit: 10 } });
    });

    test("an empty stage says there is nothing to do", async () => {
        renderPage();
        await screen.findByText("ORD-000001");

        await userEvent.click(screen.getByRole("button", { name: /^packed/i }));

        expect(await screen.findByText(/nothing to do here/i)).toBeInTheDocument();
    });

    test("doing a step refreshes the counts and the list", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage();
        await screen.findByText("ORD-000001");
        const before = api.get.mock.calls.length;

        await userEvent.click(screen.getByRole("button", { name: "Start processing ORD-000001" }));

        expect(api.put).toHaveBeenCalledWith("/orders/o1/status", { status: "PROCESSING" });
        expect(await screen.findByText("ORD-000001 is now processing.")).toBeInTheDocument();
        // queue + list were requested again
        await vi.waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(before + 2));
    });

    test("the shipped stage offers delivery, and packed orders ask for tracking before shipping", async () => {
        ordersByStatus.PACKED = [makeOrder("o5", "ORD-000005", "PACKED")];
        renderPage();
        await screen.findByText("ORD-000001");

        await userEvent.click(screen.getByRole("button", { name: /^shipped/i }));
        expect(await screen.findByRole("button", { name: "Mark delivered ORD-000004" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /^packed/i }));
        await userEvent.click(await screen.findByRole("button", { name: "Ship order ORD-000005" }));
        expect(within(screen.getByRole("dialog")).getByLabelText("Tracking number")).toBeInTheDocument();
        ordersByStatus.PACKED = [];
    });

    test("an inventory manager sees the queue but no action buttons", async () => {
        renderPage("INVENTORY_MANAGER");

        expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /start processing/i })).not.toBeInTheDocument();
        expect(screen.queryByText("Next step")).not.toBeInTheDocument();
    });

    test("shows an error when the queue can't be loaded", async () => {
        api.get.mockImplementation((url, config) =>
            url === "/orders/fulfillment-queue"
                ? Promise.reject({ response: { data: { message: "Queue unavailable" } } })
                : Promise.resolve({ data: { data: { orders: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } } })
        );
        renderPage();

        expect(await screen.findByText("Queue unavailable")).toBeInTheDocument();
    });
});

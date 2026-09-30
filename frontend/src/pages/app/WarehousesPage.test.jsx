import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WarehousesPage from "./WarehousesPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const delhi = {
    _id: "w1", name: "Delhi Central", code: "DEL-01", address: "", city: "Delhi", state: "Delhi",
    capacity: 5000, manager: { _id: "m1", name: "Ravi Kumar" }, status: "ACTIVE"
};
const mumbai = { _id: "w2", name: "Mumbai Hub", code: "MUM-01", address: "", city: "Mumbai", state: "", capacity: 8000, manager: null, status: "INACTIVE" };

const managers = [{ _id: "m1", name: "Ravi Kumar" }, { _id: "m2", name: "Neha Singh" }];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) =>
        Promise.resolve(
            url === "/users"
                ? { data: { data: { users: managers } } }
                : { data: { data: { warehouses: [delhi, mumbai], pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } } }
        )
    );
});

const renderPage = (role) => renderWithProviders(<WarehousesPage />, { preloadedState: authState(role), route: "/warehouses", path: "/warehouses" });

describe("WarehousesPage", () => {
    test("lists warehouses with manager and capacity", async () => {
        renderPage("ADMIN");

        expect(await screen.findByText("Delhi Central")).toBeInTheDocument();
        expect(screen.getByText("DEL-01")).toBeInTheDocument();
        expect(screen.getByText("5,000 units")).toBeInTheDocument();
        expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    });

    test("staff can only view warehouses", async () => {
        renderPage("STAFF");

        expect(await screen.findByText("Delhi Central")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /new warehouse/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    });

    test("an inventory manager can edit, but does not load users or see the manager field", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage("INVENTORY_MANAGER");
        await screen.findByText("Delhi Central");

        // Listing users is admin-only on the backend, so it must not even be attempted
        expect(api.get).not.toHaveBeenCalledWith("/users", expect.anything());

        await userEvent.click(screen.getByRole("button", { name: "Edit Delhi Central" }));
        expect(screen.queryByLabelText(/manager/i)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        // manager is left out entirely, so the backend keeps the current one
        expect(api.put).toHaveBeenCalledWith("/warehouses/w1", {
            name: "Delhi Central", code: "DEL-01", address: "", city: "Delhi", state: "Delhi", capacity: 5000
        });
    });

    test("admin creates a warehouse and can pick a manager", async () => {
        api.post.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Delhi Central");

        await userEvent.click(screen.getByRole("button", { name: /new warehouse/i }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Name"), "Pune Depot");
        await userEvent.type(within(dialog).getByLabelText(/^Code/), "PUN-01");
        await userEvent.type(within(dialog).getByLabelText("City"), "Pune");
        await userEvent.selectOptions(within(dialog).getByLabelText(/manager/i), "m2");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create warehouse" }));

        expect(api.post).toHaveBeenCalledWith("/warehouses", {
            name: "Pune Depot", code: "PUN-01", address: "", city: "Pune", state: "", capacity: 1000, manager: "m2"
        });
        expect(await screen.findByText("Warehouse created.")).toBeInTheDocument();
    });

    test("choosing 'No manager' sends null to remove the manager", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Delhi Central");

        await userEvent.click(screen.getByRole("button", { name: "Edit Delhi Central" }));
        await userEvent.selectOptions(screen.getByLabelText(/manager/i), "");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/warehouses/w1", expect.objectContaining({ manager: null }));
    });

    test("the form validates code and capacity", async () => {
        renderPage("ADMIN");
        await screen.findByText("Delhi Central");

        await userEvent.click(screen.getByRole("button", { name: /new warehouse/i }));
        await userEvent.type(screen.getByLabelText(/^Code/), "no spaces");
        await userEvent.clear(screen.getByLabelText("Capacity (units)"));
        await userEvent.click(screen.getByRole("button", { name: "Create warehouse" }));

        expect(await screen.findByText("Warehouse code can only contain letters, numbers and dashes")).toBeInTheDocument();
        expect(screen.getByText("Capacity must be a number")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("shows the server's reason when a warehouse that still holds stock can't be deactivated", async () => {
        api.delete.mockRejectedValue({
            response: { data: { message: "Cannot deactivate: the warehouse still holds 50 unit(s). Transfer the stock out first." } }
        });
        renderPage("INVENTORY_MANAGER");
        await screen.findByText("Delhi Central");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Delhi Central" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(await screen.findByText(/still holds 50 unit/)).toBeInTheDocument();
    });

    test("deactivates after confirmation and reactivates an inactive warehouse", async () => {
        api.delete.mockResolvedValue({ data: {} });
        api.put.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Delhi Central");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Delhi Central" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));
        expect(api.delete).toHaveBeenCalledWith("/warehouses/w1");
        expect(await screen.findByText("Warehouse deactivated.")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Reactivate Mumbai Hub" }));
        expect(api.put).toHaveBeenCalledWith("/warehouses/w2", { status: "ACTIVE" });
    });
});

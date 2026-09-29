import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsersPage from "./UsersPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

// The logged-in admin (from authState) has _id "u1"
const me = { _id: "u1", name: "Ravi Kumar", email: "ravi@shop.com", role: "ADMIN", status: "ACTIVE", phone: "", lastLoginAt: "2026-09-28T10:00:00.000Z" };
const staff = { _id: "u2", name: "Sunita Rao", email: "sunita@shop.com", role: "STAFF", status: "ACTIVE", phone: "9999999999" };
const pending = { _id: "u3", name: "New Person", email: "new@shop.com", role: "STAFF", status: "PENDING", phone: "" };
const inactive = { _id: "u4", name: "Old Timer", email: "old@shop.com", role: "INVENTORY_MANAGER", status: "INACTIVE", phone: "" };
const supplierUser = { _id: "u5", name: "Suresh", email: "suresh@acme.in", role: "SUPPLIER", status: "ACTIVE", phone: "", supplier: { _id: "s1", name: "Acme Electronics" } };

const suppliers = [{ _id: "s1", name: "Acme Electronics" }, { _id: "s2", name: "Bharat Foods" }];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) =>
        Promise.resolve(
            url === "/suppliers"
                ? { data: { data: { suppliers } } }
                : { data: { data: { users: [me, staff, pending, inactive, supplierUser], pagination: { page: 1, limit: 10, total: 5, totalPages: 1 } } } }
        )
    );
    api.post.mockResolvedValue({ data: {} });
    api.put.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });
});

const renderPage = () => renderWithProviders(<UsersPage />, { preloadedState: authState("ADMIN"), route: "/users", path: "/users" });

describe("UsersPage", () => {
    test("lists users with role, supplier company and status", async () => {
        renderPage();

        expect(await screen.findByText("Sunita Rao")).toBeInTheDocument();
        expect(screen.getByText("(you)")).toBeInTheDocument();
        expect(screen.getByText("Pending approval", { selector: "span.badge" })).toBeInTheDocument();
        expect(within(screen.getByText("Suresh").closest("tr")).getByText("Acme Electronics")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/users", { params: { page: 1, limit: 10 } });
    });

    test("search, role and status filters are sent to the API", async () => {
        renderPage();
        await screen.findByText("Sunita Rao");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Role" }), "STAFF");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "PENDING");
        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "sun");

        await vi.waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/users", { params: { search: "sun", role: "STAFF", status: "PENDING", page: 1, limit: 10 } }));
    });

    test("approving a pending sign-up sets the status to ACTIVE", async () => {
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Approve New Person" }));

        expect(api.put).toHaveBeenCalledWith("/users/u3", { status: "ACTIVE" });
        expect(await screen.findByText("New Person was approved and can now sign in.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve Sunita Rao" })).not.toBeInTheDocument();
    });

    test("an inactive user can be reactivated", async () => {
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Reactivate Old Timer" }));

        expect(api.put).toHaveBeenCalledWith("/users/u4", { status: "ACTIVE" });
        expect(await screen.findByText("Old Timer was reactivated.")).toBeInTheDocument();
    });

    test("you can't deactivate yourself (no button), others ask for confirmation first", async () => {
        renderPage();
        await screen.findByText("Sunita Rao");

        expect(screen.queryByRole("button", { name: "Deactivate Ravi Kumar" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Sunita Rao" }));
        expect(api.delete).not.toHaveBeenCalled();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(api.delete).toHaveBeenCalledWith("/users/u2");
        expect(await screen.findByText("Sunita Rao was deactivated.")).toBeInTheDocument();
    });

    test("shows the server's message when an update is refused", async () => {
        api.put.mockRejectedValue({ response: { data: { message: "Supplier is inactive" } } });
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Reactivate Old Timer" }));

        expect(await screen.findByText("Supplier is inactive")).toBeInTheDocument();
    });
});

describe("UsersPage — create user", () => {
    const openForm = async () => {
        renderPage();
        await screen.findByText("Sunita Rao");
        await userEvent.click(screen.getByRole("button", { name: /new user/i }));
        return screen.getByRole("dialog");
    };

    test("creates a user", async () => {
        const dialog = await openForm();

        await userEvent.type(within(dialog).getByLabelText("Full name"), "Neha Singh");
        await userEvent.type(within(dialog).getByLabelText("Email"), "neha@shop.com");
        await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "INVENTORY_MANAGER");
        await userEvent.type(within(dialog).getByLabelText("Password"), "Manager123");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

        expect(api.post).toHaveBeenCalledWith("/users", { name: "Neha Singh", email: "neha@shop.com", phone: "", password: "Manager123", role: "INVENTORY_MANAGER" });
        expect(await screen.findByText("User created.")).toBeInTheDocument();
    });

    test("a supplier user must be linked to a supplier company", async () => {
        const dialog = await openForm();

        expect(within(dialog).queryByLabelText("Supplier company")).not.toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Full name"), "Ali");
        await userEvent.type(within(dialog).getByLabelText("Email"), "ali@bharat.in");
        await userEvent.type(within(dialog).getByLabelText("Password"), "Supplier123");
        await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "SUPPLIER");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

        expect(await within(dialog).findByText("Choose the supplier company this user belongs to")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();

        await userEvent.selectOptions(within(dialog).getByLabelText("Supplier company"), "s2");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

        expect(api.post).toHaveBeenCalledWith("/users", expect.objectContaining({ role: "SUPPLIER", supplier: "s2" }));
    });

    test("validates name, email and password rules", async () => {
        const dialog = await openForm();

        await userEvent.type(within(dialog).getByLabelText("Email"), "nope");
        await userEvent.type(within(dialog).getByLabelText("Password"), "short");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

        expect(await within(dialog).findByText("Name must be at least 2 characters")).toBeInTheDocument();
        expect(within(dialog).getByText("Email is not valid")).toBeInTheDocument();
        expect(within(dialog).getByText("Password must be at least 8 characters")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("shows the server's message when the email is taken", async () => {
        api.post.mockRejectedValue({ response: { data: { message: "An account with this email already exists" } } });
        const dialog = await openForm();

        await userEvent.type(within(dialog).getByLabelText("Full name"), "Neha Singh");
        await userEvent.type(within(dialog).getByLabelText("Email"), "sunita@shop.com");
        await userEvent.type(within(dialog).getByLabelText("Password"), "Manager123");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));

        expect(await within(dialog).findByText("An account with this email already exists")).toBeInTheDocument();
    });
});

describe("UsersPage — edit user", () => {
    test("edits another user: role and status can change, and only changes to status are sent", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Edit Sunita Rao" }));
        const dialog = screen.getByRole("dialog");

        expect(within(dialog).getByLabelText("Full name")).toHaveValue("Sunita Rao");
        await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "INVENTORY_MANAGER");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

        // status wasn't touched, so it isn't sent
        expect(api.put).toHaveBeenCalledWith("/users/u2", { name: "Sunita Rao", email: "sunita@shop.com", phone: "9999999999", role: "INVENTORY_MANAGER" });
        expect(await screen.findByText("User updated.")).toBeInTheDocument();
    });

    test("changing the status sends it", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Edit Sunita Rao" }));
        const dialog = screen.getByRole("dialog");

        await userEvent.selectOptions(within(dialog).getByLabelText("Status"), "INACTIVE");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/users/u2", expect.objectContaining({ status: "INACTIVE" }));
    });

    test("your own role and status are locked, and are not sent", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Edit Ravi Kumar" }));
        const dialog = screen.getByRole("dialog");

        expect(within(dialog).getByText("You can't change your own role")).toBeInTheDocument();
        expect(within(dialog).getByText("You can't change your own status")).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Role")).toHaveAttribute("readonly");

        await userEvent.clear(within(dialog).getByLabelText("Phone (optional)"));
        await userEvent.type(within(dialog).getByLabelText("Phone (optional)"), "8888888888");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/users/u1", { name: "Ravi Kumar", email: "ravi@shop.com", phone: "8888888888" });
    });

    test("a pending user left as pending doesn't get a status change", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Edit New Person" }));
        const dialog = screen.getByRole("dialog");

        expect(within(dialog).getByLabelText("Status")).toHaveValue("PENDING");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/users/u3", { name: "New Person", email: "new@shop.com", phone: "", role: "STAFF" });
    });

    test("moving a supplier user to another role removes the supplier link", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Edit Suresh" }));
        const dialog = screen.getByRole("dialog");

        expect(within(dialog).getByLabelText("Supplier company")).toHaveValue("s1");
        await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "STAFF");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/users/u5", expect.objectContaining({ role: "STAFF", supplier: null }));
    });
});

describe("UsersPage — reset password", () => {
    test("sets a new password for someone else", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Reset password for Sunita Rao" }));
        const dialog = screen.getByRole("dialog");

        await userEvent.type(within(dialog).getByLabelText("New password"), "Fresh1234");
        await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "Fresh1234");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));

        expect(api.put).toHaveBeenCalledWith("/users/u2/password", { newPassword: "Fresh1234" });
        expect(await screen.findByText("Password reset for Sunita Rao. They must log in again.")).toBeInTheDocument();
    });

    test("the two passwords must match and follow the rules", async () => {
        renderPage();
        await userEvent.click(await screen.findByRole("button", { name: "Reset password for Sunita Rao" }));
        const dialog = screen.getByRole("dialog");

        await userEvent.type(within(dialog).getByLabelText("New password"), "Fresh1234");
        await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "Different1");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
        expect(await within(dialog).findByText("Passwords do not match")).toBeInTheDocument();

        await userEvent.clear(within(dialog).getByLabelText("New password"));
        await userEvent.type(within(dialog).getByLabelText("New password"), "onlyletters");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reset password" }));
        expect(await within(dialog).findByText("Password must contain at least one number")).toBeInTheDocument();
        expect(api.put).not.toHaveBeenCalled();
    });
});

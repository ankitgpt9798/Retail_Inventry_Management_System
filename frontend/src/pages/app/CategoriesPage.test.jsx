import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoriesPage from "./CategoriesPage";
import api from "../../services/api";
import { authState, renderWithProviders } from "../../test/testUtils";

vi.mock("../../services/api", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const listResponse = (categories) => ({
    data: { data: { categories, pagination: { page: 1, limit: 10, total: categories.length, totalPages: 1 } } }
});

const electronics = { _id: "c1", name: "Electronics", description: "Gadgets", status: "ACTIVE" };
const grocery = { _id: "c2", name: "Grocery", description: "", status: "INACTIVE" };

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(listResponse([electronics, grocery]));
});

const renderPage = (role) => renderWithProviders(<CategoriesPage />, { preloadedState: authState(role), route: "/categories", path: "/categories" });

describe("CategoriesPage", () => {
    test("lists categories from the API", async () => {
        renderPage("ADMIN");

        expect(await screen.findByText("Electronics")).toBeInTheDocument();
        expect(screen.getByText("Grocery")).toBeInTheDocument();
        // Empty filters are left out of the request
        expect(api.get).toHaveBeenCalledWith("/categories", { params: { page: 1, limit: 10 } });
    });

    test("staff can only view: no create, edit or deactivate buttons", async () => {
        renderPage("STAFF");

        expect(await screen.findByText("Electronics")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /new category/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    });

    test("typing in search asks the API for matching categories", async () => {
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "groc");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/categories", { params: expect.objectContaining({ search: "groc", page: 1 }) })
        );
    });

    test("status filter is sent to the API", async () => {
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "INACTIVE");

        await vi.waitFor(() =>
            expect(api.get).toHaveBeenLastCalledWith("/categories", { params: expect.objectContaining({ status: "INACTIVE" }) })
        );
    });

    test("admin creates a category", async () => {
        api.post.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.click(screen.getByRole("button", { name: /new category/i }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Name"), "Furniture");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create category" }));

        expect(api.post).toHaveBeenCalledWith("/categories", { name: "Furniture", description: "" });
        expect(await screen.findByText("Category created.")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("the form blocks a too-short name without calling the API", async () => {
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.click(screen.getByRole("button", { name: /new category/i }));
        await userEvent.type(screen.getByLabelText("Name"), "A");
        await userEvent.click(screen.getByRole("button", { name: "Create category" }));

        expect(await screen.findByText("Category name must be at least 2 characters")).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    test("admin edits a category (form is pre-filled)", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.click(screen.getByRole("button", { name: "Edit Electronics" }));
        const name = screen.getByLabelText("Name");
        expect(name).toHaveValue("Electronics");
        await userEvent.clear(name);
        await userEvent.type(name, "Electronic goods");
        await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

        expect(api.put).toHaveBeenCalledWith("/categories/c1", { name: "Electronic goods", description: "Gadgets" });
        expect(await screen.findByText("Category updated.")).toBeInTheDocument();
    });

    test("deactivating asks for confirmation first", async () => {
        api.delete.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Electronics" }));
        expect(api.delete).not.toHaveBeenCalled();

        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(api.delete).toHaveBeenCalledWith("/categories/c1");
        expect(await screen.findByText("Category deactivated.")).toBeInTheDocument();
    });

    test("shows the server's reason when deactivating is refused", async () => {
        api.delete.mockRejectedValue({ response: { data: { message: "Category still has active products" } } });
        renderPage("ADMIN");
        await screen.findByText("Electronics");

        await userEvent.click(screen.getByRole("button", { name: "Deactivate Electronics" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));

        expect(await screen.findByText("Category still has active products")).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("an inactive category can be reactivated", async () => {
        api.put.mockResolvedValue({ data: {} });
        renderPage("ADMIN");
        await screen.findByText("Grocery");

        await userEvent.click(screen.getByRole("button", { name: "Reactivate Grocery" }));

        expect(api.put).toHaveBeenCalledWith("/categories/c2", { status: "ACTIVE" });
        expect(await screen.findByText("Category reactivated.")).toBeInTheDocument();
    });

    test("shows an error with a retry button when loading fails", async () => {
        api.get.mockRejectedValueOnce({ response: { data: { message: "Database is down" } } });
        renderPage("ADMIN");

        expect(await screen.findByText("Database is down")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Electronics")).toBeInTheDocument();
    });
});

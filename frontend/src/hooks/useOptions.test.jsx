import { vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useOptions from "./useOptions";
import api from "../services/api";

vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));

// `total` items served in pages of the size the caller asks for
const serve = (total) => {
    api.get.mockImplementation((path, { params }) => {
        const start = (params.page - 1) * params.limit;
        const products = Array.from({ length: total }, (_, index) => ({ _id: `p${index}` })).slice(start, start + params.limit);
        return Promise.resolve({ data: { data: { products, pagination: { totalPages: Math.ceil(total / params.limit) } } } });
    });
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("useOptions", () => {
    test("returns every item of a list longer than one page (the F3 bug: it used to stop at 100)", async () => {
        serve(230);

        const { result } = renderHook(() => useOptions("/products", "products", { status: "ACTIVE" }));

        await waitFor(() => expect(result.current).toHaveLength(230));
        expect(result.current.at(229)._id).toBe("p229");
        expect(api.get).toHaveBeenCalledWith("/products", { params: { status: "ACTIVE", limit: 100, page: 3 } });
    });

    test("does not ask at all when it is disabled", async () => {
        serve(10);

        const { result } = renderHook(() => useOptions("/suppliers", "suppliers", {}, false));

        expect(result.current).toEqual([]);
        expect(api.get).not.toHaveBeenCalled();
    });

    test("a failed load leaves an empty list instead of crashing the page", async () => {
        api.get.mockRejectedValue(new Error("boom"));

        const { result } = renderHook(() => useOptions("/products", "products"));

        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(result.current).toEqual([]);
    });

    test("asks again only when the filters really change, not on every render", async () => {
        serve(5);

        const { result, rerender } = renderHook(({ params }) => useOptions("/products", "products", params), { initialProps: { params: { status: "ACTIVE" } } });
        await waitFor(() => expect(result.current).toHaveLength(5));
        const calls = api.get.mock.calls.length;

        rerender({ params: { status: "ACTIVE" } }); // a NEW object with the same content
        expect(api.get.mock.calls.length).toBe(calls);

        rerender({ params: { status: "INACTIVE" } });
        await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(calls));
    });
});

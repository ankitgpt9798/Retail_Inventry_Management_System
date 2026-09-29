import { vi } from "vitest";
import api from "./api";
import fetchAllPages, { MAX_PAGES, PAGE_SIZE } from "./fetchAllPages";

vi.mock("./api", () => ({ default: { get: vi.fn() } }));

// A fake API with `total` products, served in pages like the real one
const serve = (total, { pagination = true } = {}) => {
    const all = Array.from({ length: total }, (_, index) => ({ _id: `p${index}`, name: `Product ${index}` }));
    api.get.mockImplementation((path, { params }) => {
        const start = (params.page - 1) * params.limit;
        const data = { products: all.slice(start, start + params.limit) };
        if (pagination) data.pagination = { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) };
        return Promise.resolve({ data: { data } });
    });
    return all;
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("fetchAllPages", () => {
    test("a short list needs only one request", async () => {
        serve(30);

        const items = await fetchAllPages("/products", "products", { status: "ACTIVE" });

        expect(items).toHaveLength(30);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith("/products", { params: { status: "ACTIVE", limit: PAGE_SIZE, page: 1 } });
    });

    test("a long list is fetched page by page and joined in order, so the 101st item is not lost", async () => {
        const all = serve(250);

        const items = await fetchAllPages("/products", "products");

        expect(items).toHaveLength(250);
        expect(items.map((item) => item._id)).toEqual(all.map((item) => item._id)); // same items, same order
        expect(items.at(100)._id).toBe("p100"); // exactly the one the old code dropped
        expect(api.get.mock.calls.map(([, { params }]) => params.page)).toEqual([1, 2, 3]);
    });

    test("exactly one full page does not ask for a second", async () => {
        serve(100);
        await fetchAllPages("/products", "products");
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test("an answer without paging information is treated as a single page", async () => {
        serve(5, { pagination: false });

        expect(await fetchAllPages("/products", "products")).toHaveLength(5);
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test("an empty list is an empty list", async () => {
        serve(0);
        expect(await fetchAllPages("/products", "products")).toEqual([]);
    });

    test("an item that shows up on two pages (a record added while loading) is only kept once", async () => {
        api.get.mockImplementation((path, { params }) =>
            Promise.resolve({
                data: {
                    data: {
                        products: params.page === 1 ? [{ _id: "a" }, { _id: "b" }] : [{ _id: "b" }, { _id: "c" }],
                        pagination: { totalPages: 2 }
                    }
                }
            })
        );

        const items = await fetchAllPages("/products", "products");

        expect(items.map((item) => item._id)).toEqual(["a", "b", "c"]);
    });

    test("a safety limit stops a runaway list at MAX_PAGES", async () => {
        serve((MAX_PAGES + 20) * PAGE_SIZE);

        const items = await fetchAllPages("/products", "products");

        expect(api.get).toHaveBeenCalledTimes(MAX_PAGES);
        expect(items).toHaveLength(MAX_PAGES * PAGE_SIZE);
    });

    test("if any page fails, the whole load fails (no silently half-empty list)", async () => {
        api.get.mockImplementation((path, { params }) =>
            params.page === 2
                ? Promise.reject(new Error("network down"))
                : Promise.resolve({ data: { data: { products: [{ _id: `p${params.page}` }], pagination: { totalPages: 3 } } } })
        );

        await expect(fetchAllPages("/products", "products")).rejects.toThrow("network down");
    });
});

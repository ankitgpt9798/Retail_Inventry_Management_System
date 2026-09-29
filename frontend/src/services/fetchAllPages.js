import api from "./api";

// The API never returns more than this many items in one request
export const PAGE_SIZE = 100;

// A safety stop, so a mistake can never turn one drop-down into thousands of requests.
// 50 pages × 100 = 5,000 items, far more than any drop-down of choices should ever hold.
export const MAX_PAGES = 50;

// Gets EVERY item of a list, not just the first page: first page 1, which says how many pages there are,
// then all the other pages at the same time.
//   path:    "/products"
//   listKey: "products"  (the array inside response.data.data)
//   params:  filters, e.g. { status: "ACTIVE" }
// Items that appear on two pages (because someone added a record while we were loading) are only kept once.
const fetchAllPages = async (path, listKey, params = {}) => {
    const load = (page) => api.get(path, { params: { ...params, limit: PAGE_SIZE, page } });

    const first = (await load(1)).data.data;
    const items = [...first[listKey]];

    // No pagination info = the answer was one single page
    const totalPages = Math.min(first.pagination?.totalPages ?? 1, MAX_PAGES);
    if (totalPages > 1) {
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => load(index + 2)));
        for (const response of rest) {
            items.push(...response.data.data[listKey]);
        }
    }

    const seen = new Set();
    return items.filter((item) => {
        if (item?._id === undefined) return true;
        if (seen.has(item._id)) return false;
        seen.add(item._id);
        return true;
    });
};

export default fetchAllPages;

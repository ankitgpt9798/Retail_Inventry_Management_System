import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination, { getPageNumbers } from "./Pagination";
import RecordList from "./RecordList";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";
import { getStockStatus, PAYMENT_STATUS_STYLES } from "../../utils/statusStyles";

describe("getPageNumbers", () => {
    test("few pages: all of them", () => {
        expect(getPageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    test("many pages: first, last and the neighbours of the current page, with gaps", () => {
        expect(getPageNumbers(1, 20)).toEqual([1, 2, "…", 20]);
        expect(getPageNumbers(6, 20)).toEqual([1, "…", 5, 6, 7, "…", 20]);
        expect(getPageNumbers(20, 20)).toEqual([1, "…", 19, 20]);
    });
});

describe("Pagination", () => {
    test("'Showing 11–20 of 45', the current page marked, Previous/Next move one page", async () => {
        const onPageChange = vi.fn();
        render(<Pagination pagination={{ page: 2, limit: 10, total: 45, totalPages: 5 }} onPageChange={onPageChange} noun="orders" />);

        expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveTextContent("Showing 11–20 of 45 orders");
        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");

        await userEvent.click(screen.getByRole("button", { name: "Next page" }));
        await userEvent.click(screen.getByRole("button", { name: "Page 5" }));
        expect(onPageChange.mock.calls).toEqual([[3], [5]]);
    });

    test("the last page shows the real last item number; one page has no buttons; nothing for an empty list", () => {
        const { rerender, container } = render(<Pagination pagination={{ page: 5, limit: 10, total: 45, totalPages: 5 }} onPageChange={() => {}} />);
        expect(screen.getByRole("navigation")).toHaveTextContent("Showing 41–45 of 45");
        expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

        rerender(<Pagination pagination={{ page: 1, limit: 10, total: 3, totalPages: 1 }} onPageChange={() => {}} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();

        rerender(<Pagination pagination={{ page: 1, limit: 10, total: 0, totalPages: 0 }} onPageChange={() => {}} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("RecordList", () => {
    const renderItem = (item) => <article key={item.id} aria-label={item.name}>{item.name}</article>;

    test("loading → skeleton cards", () => {
        render(<RecordList items={[]} isLoading renderItem={renderItem} noun="products" />);
        expect(screen.getByRole("status", { name: "Loading products…" })).toBeInTheDocument();
    });

    test("error → message and a Try again button", async () => {
        const onRetry = vi.fn();
        render(<RecordList items={[]} error="Database is down" onRetry={onRetry} renderItem={renderItem} noun="products" />);

        expect(screen.getByText("Could not load products")).toBeInTheDocument();
        expect(screen.getByText("Database is down")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalled();
    });

    test("empty because of filters → 'No products found' + Clear filters", async () => {
        const onClearFilters = vi.fn();
        render(<RecordList items={[]} isFiltered onClearFilters={onClearFilters} renderItem={renderItem} noun="products" />);

        expect(screen.getByText("No products found")).toBeInTheDocument();
        expect(screen.getByText("Try changing your search or filters.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(onClearFilters).toHaveBeenCalled();
    });

    test("empty with no filters → the 'nothing yet' message; otherwise the cards", () => {
        const { rerender } = render(<RecordList items={[]} renderItem={renderItem} noun="products" emptyMessage="Add your first product." />);
        expect(screen.getByText("No products yet")).toBeInTheDocument();
        expect(screen.getByText("Add your first product.")).toBeInTheDocument();

        rerender(<RecordList items={[{ id: 1, name: "Rice" }, { id: 2, name: "Tea" }]} renderItem={renderItem} noun="products" />);
        expect(screen.getAllByRole("article").map((card) => card.textContent)).toEqual(["Rice", "Tea"]);
    });
});

describe("StatCard", () => {
    test("shows a long rupee amount in full (it wraps instead of being cut off)", () => {
        render(<StatCard label="Stock value" value="₹1,05,67,900.00" testId="value" />);

        const value = screen.getByTestId("value");
        expect(value).toHaveTextContent("₹1,05,67,900.00");
        // The size follows the card's width (container query) and long numbers may wrap
        expect(value.className).toContain("[overflow-wrap:anywhere]");
        expect(value.parentElement.className).toContain("@container");
    });
});

describe("status helpers", () => {
    test("stock status: out of stock, low, overstocked (over 5 × reorder level) or healthy", () => {
        expect(getStockStatus({ quantity: 5, availableQuantity: 0, reorderLevel: 10 })).toBe("OUT_OF_STOCK");
        expect(getStockStatus({ quantity: 9, availableQuantity: 9, reorderLevel: 10 })).toBe("LOW_STOCK");
        expect(getStockStatus({ quantity: 51, availableQuantity: 51, reorderLevel: 10 })).toBe("OVERSTOCKED");
        expect(getStockStatus({ quantity: 50, availableQuantity: 50, reorderLevel: 10 })).toBe("HEALTHY");
        expect(getStockStatus({ quantity: 500, availableQuantity: 500, reorderLevel: 0 })).toBe("HEALTHY");
    });

    test("StatusBadge uses the table it is given, and shows unknown statuses as they are", () => {
        const { rerender } = render(<StatusBadge status="PARTIALLY_PAID" styles={PAYMENT_STATUS_STYLES} />);
        expect(screen.getByText("Partially paid")).toBeInTheDocument();

        rerender(<StatusBadge status="SOMETHING_NEW" />);
        expect(screen.getByText("SOMETHING_NEW")).toBeInTheDocument();
    });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BarChart from "./BarChart";
import LineChart from "./LineChart";
import ChartCard from "./ChartCard";
import DashboardCharts from "./DashboardCharts";
import { buildTicks, formatCompact, longMonth, roundedRightBar, roundedTopBar, shortMonth, truncate } from "../../utils/chart";
import { formatCurrency } from "../../utils/format";

describe("chart helpers", () => {
    test("buildTicks gives clean axis numbers that always cover the data", () => {
        expect(buildTicks(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
        expect(buildTicks(452300)).toEqual({ top: 600000, ticks: [0, 200000, 400000, 600000] });
        expect(buildTicks(100)).toEqual({ top: 100, ticks: [0, 50, 100] });
        // Nothing to draw yet: still a usable scale
        expect(buildTicks(0)).toEqual({ top: 1, ticks: [0, 1] });
        expect(buildTicks(NaN).top).toBe(1);
    });

    test("formatCompact writes big numbers short (Indian style)", () => {
        expect(formatCompact(0)).toBe("0");
        expect(formatCompact(3400)).toBe("3.4K");
        expect(formatCompact(452300)).toBe("4.5L");
    });

    test("month labels", () => {
        expect(shortMonth("2026-08")).toBe("Aug");
        expect(longMonth("2026-08")).toBe("Aug 2026");
    });

    test("bars are drawn from the baseline; empty bars draw nothing", () => {
        expect(roundedTopBar(10, 20, 24, 0)).toBe("");
        expect(roundedRightBar(10, 20, 0, 24)).toBe("");
        expect(roundedTopBar(10, 20, 24, 100)).toMatch(/^M10,120 L10,24 Q10,20 14,20/);
        // The rounding never exceeds the bar itself (a 2px-high bar can't have a 4px corner)
        expect(roundedTopBar(0, 0, 24, 2)).toContain("Q0,0 2,0");
    });

    test("truncate cuts long labels with an ellipsis", () => {
        expect(truncate("Rice 5kg", 16)).toBe("Rice 5kg");
        expect(truncate("Wireless Keyboard K100 Pro", 10)).toBe("Wireless …");
    });
});

describe("BarChart", () => {
    const data = [
        { label: "Jul", value: 310000, detail: "12 orders" },
        { label: "Aug", value: 240000, detail: "9 orders" },
        { label: "Sep", value: 452300, detail: "14 orders" }
    ];

    test("every bar is announced with its value, and there is one thin bar per data point", () => {
        const { container } = render(<BarChart data={data} formatValue={formatCurrency} valueName="Revenue" ariaLabel="Revenue by month" />);

        expect(screen.getByRole("group", { name: "Revenue by month" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Sep: ₹4,52,300.00, 14 orders" })).toBeInTheDocument();
        expect(container.querySelectorAll("path")).toHaveLength(3);
    });

    test("only the latest and the highest bar carry a number (the rest are in the tooltip and table)", () => {
        const { container } = render(<BarChart data={data} ariaLabel="x" />);
        const labels = [...container.querySelectorAll("text")].map((node) => node.textContent);

        expect(labels).toContain("4.5L"); // Sep is both the latest and the highest
        expect(labels).not.toContain("3.1L");
        expect(labels).not.toContain("2.4L");
    });

    test("hovering a bar shows a tooltip with its value and note; leaving hides it", async () => {
        render(<BarChart data={data} formatValue={formatCurrency} valueName="Revenue" ariaLabel="x" />);

        await userEvent.hover(screen.getByRole("img", { name: /^Aug/ }));
        const tooltip = screen.getByRole("tooltip");
        expect(within(tooltip).getByText("Aug")).toBeInTheDocument();
        expect(within(tooltip).getByText("₹2,40,000.00")).toBeInTheDocument();
        expect(within(tooltip).getByText("9 orders")).toBeInTheDocument();

        await userEvent.unhover(screen.getByRole("img", { name: /^Aug/ }));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    test("keyboard focus shows the same tooltip", async () => {
        render(<BarChart data={data} ariaLabel="x" />);

        await userEvent.tab();
        expect(screen.getByRole("tooltip")).toHaveTextContent("Jul");
    });

    test("horizontal bars carry their value at the tip", () => {
        const { container } = render(
            <BarChart orientation="horizontal" data={[{ label: "Delhi Central", value: 3400 }, { label: "Noida Hub", value: 700 }]} ariaLabel="x" />
        );
        const labels = [...container.querySelectorAll("text")].map((node) => node.textContent);

        expect(labels).toEqual(expect.arrayContaining(["Delhi Central", "3.4K", "Noida Hub", "700"]));
    });

    test("an all-zero series still draws without breaking", () => {
        const { container } = render(<BarChart data={[{ label: "Sep", value: 0 }]} ariaLabel="x" />);
        expect(container.querySelectorAll("path")).toHaveLength(1);
        expect(container.querySelector("path").getAttribute("d")).toBe("");
    });
});

describe("LineChart", () => {
    const data = [
        { label: "Jul", title: "Jul 2026", STOCK_IN: 450, STOCK_OUT: 110 },
        { label: "Aug", title: "Aug 2026", STOCK_IN: 90, STOCK_OUT: 300 }
    ];
    const series = [
        { key: "STOCK_IN", label: "Stock in", color: "var(--series-1)" },
        { key: "STOCK_OUT", label: "Stock out", color: "var(--series-2)" }
    ];

    test("always shows a legend, and each month is announced with every series", () => {
        render(<LineChart data={data} series={series} ariaLabel="Stock in and out" />);

        const legend = screen.getByRole("list", { name: "Legend" });
        expect(within(legend).getByText("Stock in")).toBeInTheDocument();
        expect(within(legend).getByText("Stock out")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Aug 2026: Stock in 90, Stock out 300" })).toBeInTheDocument();
    });

    test("hovering a month lists all series in one tooltip", async () => {
        render(<LineChart data={data} series={series} ariaLabel="x" />);

        await userEvent.hover(screen.getByRole("img", { name: /^Jul 2026/ }));
        const tooltip = screen.getByRole("tooltip");

        expect(within(tooltip).getByText("Jul 2026")).toBeInTheDocument();
        expect(within(tooltip).getByText("450")).toBeInTheDocument();
        expect(within(tooltip).getByText("110")).toBeInTheDocument();
    });

    test("line ends are named directly only when they are far enough apart to stay readable", () => {
        // ends 90 and 300 apart on the scale: named. Ends 100 and 101: they would collide, so only the legend names them.
        const far = render(<LineChart data={data} series={series} ariaLabel="x" />);
        const farLabels = [...far.container.querySelectorAll("svg text")].map((node) => node.textContent);
        expect(farLabels.filter((text) => text === "Stock in")).toHaveLength(1);
        far.unmount();

        const close = render(
            <LineChart data={[{ label: "Jul", STOCK_IN: 100, STOCK_OUT: 101 }]} series={series} ariaLabel="x" />
        );
        const closeLabels = [...close.container.querySelectorAll("svg text")].map((node) => node.textContent);
        expect(closeLabels).not.toContain("Stock in");
    });
});

describe("ChartCard", () => {
    const table = { columns: [{ key: "month", label: "Month" }, { key: "value", label: "Revenue", align: "right", format: formatCurrency }], rows: [{ month: "Sep", value: 1200 }] };

    test("switches between the chart and the same numbers as a table", async () => {
        render(
            <ChartCard title="Revenue" table={table}>
                <p>the chart</p>
            </ChartCard>
        );
        expect(screen.getByText("the chart")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "View table: Revenue" }));
        expect(screen.queryByText("the chart")).not.toBeInTheDocument();
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByText("₹1,200.00")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "View chart: Revenue" }));
        expect(screen.getByText("the chart")).toBeInTheDocument();
    });

    test("with nothing to show it says so instead of drawing an empty chart", () => {
        render(
            <ChartCard title="Revenue" table={table} isEmpty>
                <p>the chart</p>
            </ChartCard>
        );
        expect(screen.getByText("Nothing to show for this period yet.")).toBeInTheDocument();
        expect(screen.queryByText("the chart")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /view table/i })).not.toBeInTheDocument();
    });
});

describe("DashboardCharts", () => {
    const months = ["2026-08", "2026-09"];
    const charts = {
        ordersByMonth: months.map((month, i) => ({ month, orders: [0, 1][i], revenue: [0, 120472.1][i] })),
        purchaseTrends: months.map((month) => ({ month, purchaseOrders: 0, value: 0 })),
        stockMovement: months.map((month, i) => ({ month, STOCK_IN: [10, 0][i], STOCK_OUT: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJUSTMENT: 0 })),
        orderStatusDistribution: [{ status: "CONFIRMED", count: 2 }, { status: "DELIVERED", count: 5 }],
        inventoryByWarehouse: [{ code: "DEL-01", name: "Delhi Central", quantity: 68, utilizationPercent: 1 }],
        topProducts: [{ name: "Laptop Pro", sku: "LAP-001", unitsSold: 2, revenue: 100000 }]
    };

    test("draws the six charts and says 'nothing to show' for a measure that is all zero", () => {
        render(<DashboardCharts charts={charts} />);

        for (const title of ["Revenue by month (₹)", "Purchases by month (₹)", "Stock in and out", "Order status", "Stock by warehouse", "Top products"]) {
            expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
        }
        // Purchases are all zero → an honest empty message, not a flat empty chart
        expect(within(screen.getByRole("region", { name: "Purchases by month (₹)" })).getByText("Nothing to show for this period yet.")).toBeInTheDocument();
        expect(within(screen.getByRole("region", { name: "Revenue by month (₹)" })).getByRole("img", { name: /Sept?: ₹1,20,472.10, 1 order$/ })).toBeInTheDocument();
    });

    test("missing chart data never crashes the dashboard", () => {
        render(<DashboardCharts charts={{}} />);
        expect(screen.getAllByText("Nothing to show for this period yet.")).toHaveLength(6);
    });

    test("the stock chart's table view lists all five movement types, not just the two lines", async () => {
        render(<DashboardCharts charts={charts} />);

        await userEvent.click(screen.getByRole("button", { name: "View table: Stock in and out" }));
        const table = within(screen.getByRole("region", { name: "Stock in and out" })).getByRole("table");

        for (const heading of ["Stock in", "Stock out", "Transfer in", "Transfer out", "Adjustments"]) {
            expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
        }
    });
});

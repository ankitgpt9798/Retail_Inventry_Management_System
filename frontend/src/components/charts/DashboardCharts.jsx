import ChartCard from "./ChartCard";
import BarChart from "./BarChart";
import LineChart from "./LineChart";
import { longMonth, shortMonth } from "../../utils/chart";
import { formatCurrency, formatNumber } from "../../utils/format";
import { ORDER_STATUS_STYLES } from "../../utils/orderStatus";

const hasAnyValue = (items) => items.some((item) => item.value > 0);

// The six dashboard charts (the last six months, from GET /api/reports/dashboard).
// Each chart shows ONE measure: two measures of different size are two charts, never two axes.
const DashboardCharts = ({ charts }) => {
    // Every key is optional so a missing chart never breaks the page
    const ordersByMonth = charts.ordersByMonth ?? [];
    const purchaseTrends = charts.purchaseTrends ?? [];
    const stockMovement = charts.stockMovement ?? [];
    const inventoryByWarehouse = charts.inventoryByWarehouse ?? [];
    const topProducts = charts.topProducts ?? [];
    const orderStatusDistribution = charts.orderStatusDistribution ?? [];

    const revenue = ordersByMonth.map((row) => ({
        label: shortMonth(row.month),
        title: longMonth(row.month),
        value: row.revenue,
        orders: row.orders,
        detail: `${formatNumber(row.orders)} order${row.orders === 1 ? "" : "s"}`
    }));

    const purchaseValue = purchaseTrends.map((row) => ({
        label: shortMonth(row.month),
        title: longMonth(row.month),
        value: row.value,
        purchaseOrders: row.purchaseOrders,
        detail: `${formatNumber(row.purchaseOrders)} purchase order${row.purchaseOrders === 1 ? "" : "s"}`
    }));

    // Five movement types would be too many lines to read: the two that matter are drawn, all are in the table
    const movement = stockMovement.map((row) => ({ ...row, label: shortMonth(row.month), title: longMonth(row.month) }));

    const warehouses = inventoryByWarehouse.map((row) => ({
        label: row.name,
        code: row.code,
        value: row.quantity,
        utilizationPercent: row.utilizationPercent,
        detail: `${row.utilizationPercent}% of capacity`
    }));

    const products = topProducts.map((row) => ({
        label: row.name,
        sku: row.sku,
        value: row.unitsSold,
        revenue: row.revenue,
        detail: `${formatCurrency(row.revenue)} revenue`
    }));

    const statuses = orderStatusDistribution.map((row) => ({
        label: ORDER_STATUS_STYLES[row.status]?.label || row.status,
        value: row.count
    }));

    return (
        <div className="grid gap-6 *:min-w-0 lg:grid-cols-2">
            <ChartCard
                title="Revenue by month (₹)"
                description="Orders that were confirmed or later, not cancelled."
                isEmpty={!hasAnyValue(revenue)}
                table={{
                    columns: [
                        { key: "title", label: "Month" },
                        { key: "orders", label: "Orders", align: "right", format: formatNumber },
                        { key: "value", label: "Revenue", align: "right", format: formatCurrency }
                    ],
                    rows: revenue
                }}
            >
                <BarChart data={revenue} formatValue={formatCurrency} valueName="Revenue" ariaLabel="Revenue by month" />
            </ChartCard>

            <ChartCard
                title="Purchases by month (₹)"
                description="Value of purchase orders sent to suppliers."
                isEmpty={!hasAnyValue(purchaseValue)}
                table={{
                    columns: [
                        { key: "title", label: "Month" },
                        { key: "purchaseOrders", label: "Purchase orders", align: "right", format: formatNumber },
                        { key: "value", label: "Value", align: "right", format: formatCurrency }
                    ],
                    rows: purchaseValue
                }}
            >
                <BarChart data={purchaseValue} color="var(--series-2)" formatValue={formatCurrency} valueName="Value" ariaLabel="Purchases by month" />
            </ChartCard>

            <ChartCard
                title="Stock in and out"
                description="Units added and removed by hand each month."
                isEmpty={!movement.some((row) => row.STOCK_IN > 0 || row.STOCK_OUT > 0)}
                table={{
                    columns: [
                        { key: "title", label: "Month" },
                        { key: "STOCK_IN", label: "Stock in", align: "right", format: formatNumber },
                        { key: "STOCK_OUT", label: "Stock out", align: "right", format: formatNumber },
                        { key: "TRANSFER_IN", label: "Transfer in", align: "right", format: formatNumber },
                        { key: "TRANSFER_OUT", label: "Transfer out", align: "right", format: formatNumber },
                        { key: "ADJUSTMENT", label: "Adjustments", align: "right", format: formatNumber }
                    ],
                    rows: movement
                }}
            >
                <LineChart
                    data={movement}
                    series={[
                        { key: "STOCK_IN", label: "Stock in", color: "var(--series-1)" },
                        { key: "STOCK_OUT", label: "Stock out", color: "var(--series-2)" }
                    ]}
                    ariaLabel="Stock in and stock out by month"
                />
            </ChartCard>

            <ChartCard
                title="Order status"
                description="How many orders sit at each stage."
                isEmpty={!hasAnyValue(statuses)}
                table={{
                    columns: [
                        { key: "label", label: "Status" },
                        { key: "value", label: "Orders", align: "right", format: formatNumber }
                    ],
                    rows: statuses
                }}
            >
                <BarChart data={statuses} orientation="horizontal" valueName="Orders" ariaLabel="Orders by status" />
            </ChartCard>

            <ChartCard
                title="Stock by warehouse"
                description="Units on hand in each active warehouse."
                isEmpty={!hasAnyValue(warehouses)}
                table={{
                    columns: [
                        { key: "label", label: "Warehouse" },
                        { key: "code", label: "Code" },
                        { key: "value", label: "Units", align: "right", format: formatNumber },
                        { key: "utilizationPercent", label: "Capacity used", align: "right", format: (value) => `${value}%` }
                    ],
                    rows: warehouses
                }}
            >
                <BarChart data={warehouses} orientation="horizontal" valueName="Units" ariaLabel="Stock by warehouse" />
            </ChartCard>

            <ChartCard
                title="Top products"
                description="Best sellers by units shipped or delivered."
                isEmpty={!hasAnyValue(products)}
                table={{
                    columns: [
                        { key: "label", label: "Product" },
                        { key: "sku", label: "SKU" },
                        { key: "value", label: "Units sold", align: "right", format: formatNumber },
                        { key: "revenue", label: "Revenue", align: "right", format: formatCurrency }
                    ],
                    rows: products
                }}
            >
                <BarChart data={products} orientation="horizontal" valueName="Units sold" ariaLabel="Top products by units sold" />
            </ChartCard>
        </div>
    );
};

export default DashboardCharts;

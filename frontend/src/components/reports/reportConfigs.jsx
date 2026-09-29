import ChartCard from "../charts/ChartCard";
import BarChart from "../charts/BarChart";
import LineChart from "../charts/LineChart";
import { longMonth, shortMonth } from "../../utils/chart";
import { formatCurrency, formatNumber } from "../../utils/format";
import { ORDER_STATUS_STYLES } from "../../utils/orderStatus";
import { PURCHASE_STATUS_STYLES } from "../../utils/purchaseStatus";

// One entry per report. The page reads these and does the rest, so adding a report = adding an entry.
//   key / label:  the tab
//   path:         the API endpoint
//   filters:      which filter controls to show (see ReportFilters)
//   tiles(data):  headline numbers → [{ label, value }]
//   charts(data): → [<ChartCard …/>]
//   table(data):  → { title?, columns, rows, empty? }  (columns as in DataTable)
//   tables(data): optional extra tables after the main one

const percent = (value) => (value === null || value === undefined ? "—" : `${value}%`);

const TYPE_LABELS = {
    STOCK_IN: "Stock in",
    STOCK_OUT: "Stock out",
    TRANSFER_IN: "Transfer in",
    TRANSFER_OUT: "Transfer out",
    ADJUSTMENT: "Adjustment"
};

const statusRows = (byStatus, styles) =>
    byStatus.map((row) => ({ ...row, label: styles[row.status]?.label || row.status }));

const statusColumns = [
    { key: "label", label: "Status" },
    { key: "count", label: "Count", align: "right", format: formatNumber },
    { key: "totalAmount", label: "Value", align: "right", format: formatCurrency }
];

export const REPORTS = [
    {
        key: "inventory",
        label: "Inventory",
        path: "/reports/inventory",
        filters: ["warehouse", "category"],
        description: "Stock and its value at cost, per product.",
        tiles: (data) => [
            { label: "Products", value: formatNumber(data.summary.productCount) },
            { label: "Units on hand", value: formatNumber(data.summary.totalQuantity) },
            { label: "Reserved", value: formatNumber(data.summary.totalReserved) },
            { label: "Available", value: formatNumber(data.summary.totalAvailable) },
            { label: "Stock value", value: formatCurrency(data.summary.totalStockValue) }
        ],
        table: (data) => ({
            rows: data.rows,
            getRowKey: (row) => row.productId,
            columns: [
                { key: "name", label: "Product" },
                { key: "sku", label: "SKU" },
                { key: "category", label: "Category" },
                { key: "quantity", label: "On hand", align: "right", format: formatNumber },
                { key: "reservedQuantity", label: "Reserved", align: "right", format: formatNumber },
                { key: "availableQuantity", label: "Available", align: "right", format: formatNumber },
                { key: "costPrice", label: "Cost", align: "right", format: formatCurrency },
                { key: "stockValue", label: "Value", align: "right", format: formatCurrency }
            ]
        })
    },
    {
        key: "warehouses",
        label: "Warehouses",
        path: "/reports/warehouses",
        filters: [],
        description: "Stock, capacity used and value in each warehouse.",
        tiles: (data) => [
            { label: "Warehouses", value: formatNumber(data.summary.warehouseCount) },
            { label: "Total capacity", value: formatNumber(data.summary.totalCapacity) },
            { label: "Units on hand", value: formatNumber(data.summary.totalQuantity) },
            { label: "Capacity used", value: percent(data.summary.overallUtilizationPercent) },
            { label: "Stock value", value: formatCurrency(data.summary.totalStockValue) }
        ],
        table: (data) => ({
            rows: data.rows,
            getRowKey: (row) => row.warehouseId,
            columns: [
                { key: "name", label: "Warehouse" },
                { key: "code", label: "Code" },
                { key: "city", label: "City" },
                { key: "manager", label: "Manager", format: (value) => value || "—" },
                { key: "capacity", label: "Capacity", align: "right", format: formatNumber },
                { key: "totalQuantity", label: "On hand", align: "right", format: formatNumber },
                { key: "availableQuantity", label: "Available", align: "right", format: formatNumber },
                { key: "utilizationPercent", label: "Used", align: "right", format: percent },
                { key: "stockValue", label: "Value", align: "right", format: formatCurrency }
            ]
        })
    },
    {
        key: "stock-movement",
        label: "Stock movement",
        path: "/reports/stock-movement",
        filters: ["range", "warehouse"],
        description: "Units moved in and out, by type and by month.",
        tiles: (data) => [
            { label: "Stock in (units)", value: formatNumber(data.totals.STOCK_IN.quantity) },
            { label: "Stock out (units)", value: formatNumber(data.totals.STOCK_OUT.quantity) },
            { label: "Transferred in", value: formatNumber(data.totals.TRANSFER_IN.quantity) },
            { label: "Transferred out", value: formatNumber(data.totals.TRANSFER_OUT.quantity) },
            { label: "Adjustments", value: formatNumber(data.totals.ADJUSTMENT.quantity) }
        ],
        charts: (data) => {
            const months = data.byMonth.map((row) => ({ ...row, label: shortMonth(row.month), title: longMonth(row.month) }));
            return [
                <ChartCard
                    key="movement"
                    title="Stock in and out by month"
                    isEmpty={!months.some((row) => row.STOCK_IN > 0 || row.STOCK_OUT > 0)}
                    table={{
                        columns: [
                            { key: "title", label: "Month" },
                            { key: "STOCK_IN", label: "Stock in", align: "right", format: formatNumber },
                            { key: "STOCK_OUT", label: "Stock out", align: "right", format: formatNumber }
                        ],
                        rows: months
                    }}
                >
                    <LineChart
                        data={months}
                        series={[
                            { key: "STOCK_IN", label: "Stock in", color: "var(--series-1)" },
                            { key: "STOCK_OUT", label: "Stock out", color: "var(--series-2)" }
                        ]}
                        ariaLabel="Stock in and stock out by month"
                    />
                </ChartCard>
            ];
        },
        table: (data) => ({
            rows: Object.entries(data.totals).map(([type, total]) => ({ type: TYPE_LABELS[type] || type, ...total })),
            columns: [
                { key: "type", label: "Type" },
                { key: "quantity", label: "Units", align: "right", format: formatNumber },
                { key: "count", label: "Movements", align: "right", format: formatNumber }
            ]
        })
    },
    {
        key: "orders",
        label: "Orders",
        path: "/reports/orders",
        filters: ["range", "warehouse"],
        description: "Sales orders, revenue and how orders are progressing.",
        tiles: (data) => [
            { label: "All orders", value: formatNumber(data.summary.totalOrders) },
            { label: "Sales orders", value: formatNumber(data.summary.salesOrders) },
            { label: "Delivered", value: formatNumber(data.summary.completedOrders) },
            { label: "Cancelled", value: formatNumber(data.summary.cancelledOrders) },
            { label: "Revenue", value: formatCurrency(data.summary.revenue) },
            { label: "Average order", value: formatCurrency(data.summary.averageOrderValue) }
        ],
        charts: (data) => {
            const revenue = data.byMonth.map((row) => ({
                label: shortMonth(row.month),
                title: longMonth(row.month),
                value: row.revenue,
                orders: row.orders,
                detail: `${formatNumber(row.orders)} order${row.orders === 1 ? "" : "s"}`
            }));
            return [
                <ChartCard
                    key="revenue"
                    title="Revenue by month (₹)"
                    isEmpty={!revenue.some((row) => row.value > 0)}
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
            ];
        },
        table: (data) => ({ title: "By status", rows: statusRows(data.byStatus, ORDER_STATUS_STYLES), columns: statusColumns })
    },
    {
        key: "purchases",
        label: "Purchases",
        path: "/reports/purchases",
        filters: ["range", "supplier"],
        description: "Purchase orders placed with suppliers.",
        tiles: (data) => [
            { label: "Purchase orders", value: formatNumber(data.summary.totalPurchaseOrders) },
            { label: "Still open", value: formatNumber(data.summary.openPurchaseOrders) },
            { label: "Ordered value", value: formatCurrency(data.summary.orderedValue) },
            { label: "Received value", value: formatCurrency(data.summary.receivedValue) }
        ],
        charts: (data) => {
            const value = data.byMonth.map((row) => ({
                label: shortMonth(row.month),
                title: longMonth(row.month),
                value: row.value,
                purchaseOrders: row.purchaseOrders,
                detail: `${formatNumber(row.purchaseOrders)} purchase order${row.purchaseOrders === 1 ? "" : "s"}`
            }));
            return [
                <ChartCard
                    key="value"
                    title="Purchases by month (₹)"
                    isEmpty={!value.some((row) => row.value > 0)}
                    table={{
                        columns: [
                            { key: "title", label: "Month" },
                            { key: "purchaseOrders", label: "Purchase orders", align: "right", format: formatNumber },
                            { key: "value", label: "Value", align: "right", format: formatCurrency }
                        ],
                        rows: value
                    }}
                >
                    <BarChart data={value} color="var(--series-2)" formatValue={formatCurrency} valueName="Value" ariaLabel="Purchases by month" />
                </ChartCard>
            ];
        },
        table: (data) => ({ title: "By status", rows: statusRows(data.byStatus, PURCHASE_STATUS_STYLES), columns: statusColumns })
    },
    {
        key: "suppliers",
        label: "Suppliers",
        path: "/reports/suppliers",
        filters: ["range"],
        description: "How much you bought from each supplier and how reliably they delivered.",
        table: (data) => ({
            rows: data.rows,
            getRowKey: (row) => row.supplierId,
            columns: [
                { key: "name", label: "Supplier" },
                { key: "purchaseOrders", label: "POs", align: "right", format: formatNumber },
                { key: "unitsOrdered", label: "Units ordered", align: "right", format: formatNumber },
                { key: "unitsReceived", label: "Units received", align: "right", format: formatNumber },
                { key: "orderedValue", label: "Ordered", align: "right", format: formatCurrency },
                { key: "receivedValue", label: "Received", align: "right", format: formatCurrency },
                { key: "fulfilmentRatePercent", label: "Delivered", align: "right", format: percent },
                { key: "openPurchaseOrders", label: "Open POs", align: "right", format: formatNumber }
            ]
        })
    },
    {
        key: "low-stock",
        label: "Low stock",
        path: "/reports/low-stock",
        filters: ["warehouse"],
        description: "What is short of its reorder level, and what is already on order.",
        tiles: (data) => [
            { label: "Items low on stock", value: formatNumber(data.summary.itemCount) },
            { label: "Total shortage (units)", value: formatNumber(data.summary.totalShortage) }
        ],
        table: (data) => ({
            rows: data.rows,
            getRowKey: (row) => row.inventoryId,
            empty: "Nothing is low on stock.",
            columns: [
                { key: "product", label: "Product", format: (product) => `${product.name} (${product.sku})` },
                { key: "warehouse", label: "Warehouse", format: (warehouse) => warehouse.code },
                { key: "availableQuantity", label: "Available", align: "right", format: formatNumber },
                { key: "reorderLevel", label: "Reorder level", align: "right", format: formatNumber },
                { key: "shortage", label: "Short by", align: "right", format: formatNumber },
                { key: "onOrderQuantity", label: "On order", align: "right", format: formatNumber }
            ]
        })
    },
    {
        key: "product-performance",
        label: "Best sellers",
        path: "/reports/product-performance",
        filters: ["range", "warehouse", "sortBy", "limit"],
        description: "Products that shipped the most (units or revenue).",
        charts: (data) => {
            const byRevenue = data.sortBy === "revenue";
            const bars = data.rows.map((row) => ({
                label: row.name,
                value: byRevenue ? row.revenue : row.unitsSold,
                detail: byRevenue ? `${formatNumber(row.unitsSold)} units` : `${formatCurrency(row.revenue)} revenue`
            }));
            return [
                <ChartCard
                    key="top"
                    title={byRevenue ? "Top products by revenue (₹)" : "Top products by units sold"}
                    isEmpty={bars.length === 0}
                    table={{
                        columns: [
                            { key: "label", label: "Product" },
                            { key: "value", label: byRevenue ? "Revenue" : "Units", align: "right", format: byRevenue ? formatCurrency : formatNumber }
                        ],
                        rows: bars
                    }}
                >
                    <BarChart
                        data={bars}
                        orientation="horizontal"
                        formatValue={byRevenue ? formatCurrency : formatNumber}
                        valueName={byRevenue ? "Revenue" : "Units sold"}
                        ariaLabel="Top products"
                    />
                </ChartCard>
            ];
        },
        table: (data) => ({
            rows: data.rows,
            getRowKey: (row) => row.productId,
            columns: [
                { key: "name", label: "Product" },
                { key: "sku", label: "SKU" },
                { key: "unitsSold", label: "Units sold", align: "right", format: formatNumber },
                { key: "revenue", label: "Revenue", align: "right", format: formatCurrency },
                { key: "orderCount", label: "Orders", align: "right", format: formatNumber }
            ]
        })
    }
];

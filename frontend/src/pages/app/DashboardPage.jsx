import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
    Boxes,
    CircleCheck,
    ClipboardList,
    Clock,
    FolderTree,
    Package,
    ShoppingCart,
    Truck,
    TriangleAlert,
    Warehouse
} from "lucide-react";
import api, { getErrorMessage } from "../../services/api";
import PageHeader from "../../components/common/PageHeader";
import Loader from "../../components/common/Loader";
import ErrorAlert from "../../components/common/ErrorAlert";
import { formatCurrency, formatNumber, greeting } from "../../utils/format";

// The 10 KPIs from the spec, grouped the way people think about them.
// "tone" colours the icon; "warnWhenAboveZero" highlights numbers that need attention.
const KPI_GROUPS = [
    {
        title: "Catalog & locations",
        items: [
            { key: "totalProducts", label: "Active products", icon: Package, tone: "text-primary" },
            { key: "totalCategories", label: "Categories", icon: FolderTree, tone: "text-primary" },
            { key: "totalWarehouses", label: "Warehouses", icon: Warehouse, tone: "text-primary" },
            { key: "totalSuppliers", label: "Suppliers", icon: Truck, tone: "text-primary" }
        ]
    },
    {
        title: "Stock",
        items: [
            { key: "totalInventory", label: "Units in stock", icon: Boxes, tone: "text-secondary" },
            { key: "lowStockProducts", label: "Low-stock products", icon: TriangleAlert, tone: "text-warning", warnWhenAboveZero: true }
        ]
    },
    {
        title: "Orders & purchasing",
        items: [
            { key: "totalOrders", label: "Orders (not cancelled)", icon: ShoppingCart, tone: "text-accent" },
            { key: "pendingOrders", label: "Orders to fulfil", icon: Clock, tone: "text-accent", warnWhenAboveZero: true },
            { key: "completedOrders", label: "Delivered orders", icon: CircleCheck, tone: "text-success" },
            { key: "pendingPurchases", label: "Purchases in progress", icon: ClipboardList, tone: "text-info" }
        ]
    }
];

const DashboardPage = () => {
    const user = useSelector((state) => state.auth.user);
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // useCallback: the same function object between renders, so useEffect runs once
    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await api.get("/reports/dashboard");
            setDashboard(response.data.data);
        }
        catch (requestError) {
            setError(getErrorMessage(requestError, "Could not load the dashboard"));
        }
        finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    // The last month in the "orders by month" series is the current month
    const thisMonth = dashboard?.charts.ordersByMonth.at(-1);

    return (
        <>
            <PageHeader
                title={`${greeting()}, ${user.name.split(" ")[0]}`}
                description="Here's how your stock, orders and purchasing look right now."
            />

            {loading && <Loader text="Loading dashboard…" />}
            {!loading && error && <ErrorAlert message={error} onRetry={loadDashboard} />}

            {!loading && dashboard && (
                <div className="space-y-10">
                    {thisMonth && (
                        <div className="rounded-box bg-neutral p-6 text-neutral-content">
                            <p className="text-sm text-neutral-content/70">This month ({thisMonth.month})</p>
                            <p className="mt-1 text-2xl font-bold">
                                {formatNumber(thisMonth.orders)} sales orders · {formatCurrency(thisMonth.revenue)} revenue
                            </p>
                        </div>
                    )}

                    {KPI_GROUPS.map((group) => (
                        <section key={group.title} aria-labelledby={`kpi-${group.title}`}>
                            <h2 id={`kpi-${group.title}`} className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-content/60">
                                {group.title}
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {group.items.map((item) => {
                                    const value = dashboard.kpis[item.key];
                                    const needsAttention = item.warnWhenAboveZero && value > 0;
                                    return (
                                        <div
                                            key={item.key}
                                            className={`rounded-box border bg-base-100 p-5 ${needsAttention ? "border-warning" : "border-base-300"}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-base-content/70">{item.label}</span>
                                                <item.icon size={20} className={item.tone} aria-hidden="true" />
                                            </div>
                                            <p className="mt-3 text-3xl font-bold" data-testid={`kpi-${item.key}`}>
                                                {formatNumber(value)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </>
    );
};

export default DashboardPage;

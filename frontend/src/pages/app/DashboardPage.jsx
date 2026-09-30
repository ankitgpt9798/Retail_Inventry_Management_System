import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Boxes,
    CircleCheck,
    ClipboardList,
    Clock,
    Contact,
    FolderTree,
    IndianRupee,
    Package,
    PackageX,
    ShoppingCart,
    Truck,
    TriangleAlert,
    Warehouse
} from "lucide-react";
import api, { getErrorMessage } from "../../services/api";
import PageHeader from "../../components/common/PageHeader";
import Loader from "../../components/common/Loader";
import ErrorAlert from "../../components/common/ErrorAlert";
import StatCard from "../../components/common/StatCard";
import DashboardCharts from "../../components/charts/DashboardCharts";
import { formatCurrency, formatNumber, greeting } from "../../utils/format";

// Every number comes from GET /api/reports/dashboard, which counts the real database records.
//   format: how to show the value · tone: icon colour · warnWhenAboveZero: highlight numbers that need attention
const KPI_GROUPS = [
    {
        title: "Stock",
        items: [
            { key: "stockValue", label: "Stock value", hint: "Units on hand × cost price", icon: IndianRupee, tone: "success", format: formatCurrency },
            { key: "totalInventory", label: "Units in stock", icon: Boxes, tone: "primary" },
            { key: "lowStockProducts", label: "Low-stock products", hint: "Below reorder level somewhere", icon: TriangleAlert, tone: "warning", warnWhenAboveZero: true },
            { key: "outOfStockProducts", label: "Out of stock", hint: "Nothing available anywhere", icon: PackageX, tone: "error", warnWhenAboveZero: true }
        ]
    },
    {
        title: "Orders & purchasing",
        items: [
            { key: "pendingOrders", label: "Active orders", hint: "Not yet shipped", icon: Clock, tone: "info", warnWhenAboveZero: true },
            { key: "unconfirmedOrders", label: "Pending orders", hint: "Waiting to be confirmed", icon: ShoppingCart, tone: "warning" },
            { key: "completedOrders", label: "Delivered orders", icon: CircleCheck, tone: "success" },
            { key: "pendingPurchases", label: "Purchases in progress", icon: ClipboardList, tone: "info" }
        ]
    },
    {
        title: "Catalog & partners",
        items: [
            { key: "totalProducts", label: "Active products", icon: Package, tone: "primary" },
            { key: "totalCategories", label: "Categories", icon: FolderTree, tone: "primary" },
            { key: "totalWarehouses", label: "Warehouses", icon: Warehouse, tone: "primary" },
            { key: "totalSuppliers", label: "Suppliers", icon: Truck, tone: "primary" },
            { key: "totalCustomers", label: "Customers", icon: Contact, tone: "primary" },
            { key: "totalOrders", label: "Orders (not cancelled)", icon: ShoppingCart, tone: "neutral" }
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
                title={`${greeting()}, ${user?.name?.trim() || "Admin"} 👋`}
                description="Here's how your stock, orders and purchasing look right now."
            />

            {loading && <Loader text="Loading dashboard…" />}
            {!loading && error && <ErrorAlert message={error} onRetry={loadDashboard} />}

            {!loading && dashboard && (
                <div className="space-y-8">
                    {thisMonth && (
                        <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-primary to-indigo-800 p-6 text-primary-content shadow-raised sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-sm text-primary-content/75">This month ({thisMonth.month})</p>
                                <p className="mt-1 text-xl font-bold [overflow-wrap:anywhere] sm:text-2xl">
                                    {formatNumber(thisMonth.orders)} sales orders · {formatCurrency(thisMonth.revenue)} revenue
                                </p>
                            </div>
                            <Link to="/orders" className="btn shrink-0 border-white/25 bg-white/10 text-primary-content hover:bg-white/20">
                                View orders <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </div>
                    )}

                    {KPI_GROUPS.map((group) => {
                        // Only show numbers the API actually sent
                        const items = group.items.filter((item) => dashboard.kpis[item.key] !== undefined);
                        if (items.length === 0) return null;
                        return (
                            <section key={group.title} aria-labelledby={`kpi-${group.title}`}>
                                <h2 id={`kpi-${group.title}`} className="mb-3 text-xs font-semibold tracking-wider text-base-content/55 uppercase">
                                    {group.title}
                                </h2>
                                <div className="grid gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
                                    {items.map((item) => {
                                        const value = dashboard.kpis[item.key];
                                        return (
                                            <StatCard
                                                key={item.key}
                                                label={item.label}
                                                value={(item.format || formatNumber)(value)}
                                                hint={item.hint}
                                                icon={item.icon}
                                                tone={item.tone}
                                                highlight={item.warnWhenAboveZero && value > 0}
                                                testId={`kpi-${item.key}`}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}

                    <section aria-labelledby="dashboard-trends">
                        <h2 id="dashboard-trends" className="mb-3 text-xs font-semibold tracking-wider text-base-content/55 uppercase">
                            Trends · last 6 months
                        </h2>
                        <DashboardCharts charts={dashboard.charts} />
                    </section>
                </div>
            )}
        </>
    );
};

export default DashboardPage;

import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import PublicLayout from "../components/layout/PublicLayout";
import AppLayout from "../components/layout/AppLayout";
import ProtectedRoute from "./ProtectedRoute";
import { PAGE_ACCESS } from "../utils/navigation";

// The public website loads with the first visit (it is small and everyone sees it)
import HomePage from "../pages/public/HomePage";
import ContactPage from "../pages/public/ContactPage";
import LoginPage from "../pages/public/LoginPage";
import RegisterPage from "../pages/public/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";

// Staff-app pages are loaded only when someone opens them ("code splitting"): lazy() turns
// each import into its own file, downloaded on first use. Until it arrives, AppLayout shows a spinner.
const DashboardPage = lazy(() => import("../pages/app/DashboardPage"));
const ProfilePage = lazy(() => import("../pages/app/ProfilePage"));
const NotificationsPage = lazy(() => import("../pages/app/NotificationsPage"));
const ProductsPage = lazy(() => import("../pages/app/ProductsPage"));
const CategoriesPage = lazy(() => import("../pages/app/CategoriesPage"));
const WarehousesPage = lazy(() => import("../pages/app/WarehousesPage"));
const InventoryPage = lazy(() => import("../pages/app/InventoryPage"));
const StockHistoryPage = lazy(() => import("../pages/app/StockHistoryPage"));
const TransfersPage = lazy(() => import("../pages/app/TransfersPage"));
const OrdersPage = lazy(() => import("../pages/app/OrdersPage"));
const OrderFormPage = lazy(() => import("../pages/app/OrderFormPage"));
const OrderDetailPage = lazy(() => import("../pages/app/OrderDetailPage"));
const CustomersPage = lazy(() => import("../pages/app/CustomersPage"));
const FulfillmentPage = lazy(() => import("../pages/app/FulfillmentPage"));
const SuppliersPage = lazy(() => import("../pages/app/SuppliersPage"));
const PurchasesPage = lazy(() => import("../pages/app/PurchasesPage"));
const PurchaseFormPage = lazy(() => import("../pages/app/PurchaseFormPage"));
const PurchaseDetailPage = lazy(() => import("../pages/app/PurchaseDetailPage"));
const ReportsPage = lazy(() => import("../pages/app/ReportsPage"));
const UsersPage = lazy(() => import("../pages/app/UsersPage"));
const AuditLogPage = lazy(() => import("../pages/app/AuditLogPage"));

// Every staff-app URL: its page, and the PAGE_ACCESS entry that says which roles may open it
// (the same entry the navigation uses, so a link and its route can never disagree).
const APP_PAGES = [
    { path: "/dashboard", access: "dashboard", Page: DashboardPage },
    { path: "/products", access: "products", Page: ProductsPage },
    { path: "/categories", access: "categories", Page: CategoriesPage },
    { path: "/warehouses", access: "warehouses", Page: WarehousesPage },
    { path: "/inventory", access: "inventory", Page: InventoryPage },
    { path: "/inventory/history", access: "inventory", Page: StockHistoryPage },
    { path: "/transfers", access: "transfers", Page: TransfersPage },
    { path: "/orders", access: "orders", Page: OrdersPage },
    { path: "/orders/new", access: "orderForm", Page: OrderFormPage },
    { path: "/orders/:id", access: "orders", Page: OrderDetailPage },
    { path: "/orders/:id/edit", access: "orderForm", Page: OrderFormPage },
    { path: "/fulfillment", access: "fulfillment", Page: FulfillmentPage },
    { path: "/customers", access: "customers", Page: CustomersPage },
    { path: "/suppliers", access: "suppliers", Page: SuppliersPage },
    { path: "/purchases", access: "purchases", Page: PurchasesPage },
    { path: "/purchases/new", access: "purchaseForm", Page: PurchaseFormPage },
    { path: "/purchases/:id", access: "purchases", Page: PurchaseDetailPage },
    { path: "/purchases/:id/edit", access: "purchaseForm", Page: PurchaseFormPage },
    { path: "/reports", access: "reports", Page: ReportsPage },
    { path: "/users", access: "users", Page: UsersPage },
    { path: "/audit-logs", access: "auditLogs", Page: AuditLogPage },
    { path: "/notifications", access: "notifications", Page: NotificationsPage },
    { path: "/profile", access: "profile", Page: ProfilePage }
];

// Every URL in the app.
//  - Public pages share PublicLayout (website header + footer)
//  - Staff-app pages share AppLayout and need a login; each page also lists
//    which roles may open it (PAGE_ACCESS in utils/navigation.js)
const AppRoutes = () => {
    return (
        <Routes>
            <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                {APP_PAGES.map(({ path, access, Page }) => (
                    <Route
                        key={path}
                        path={path}
                        element={
                            <ProtectedRoute roles={PAGE_ACCESS[access]}>
                                <Page />
                            </ProtectedRoute>
                        }
                    />
                ))}
            </Route>
        </Routes>
    );
};

export default AppRoutes;

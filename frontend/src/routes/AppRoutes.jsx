import { Route, Routes } from "react-router-dom";
import PublicLayout from "../components/layout/PublicLayout";
import AppLayout from "../components/layout/AppLayout";
import ProtectedRoute from "./ProtectedRoute";
import { PAGE_ACCESS } from "../utils/navigation";

import HomePage from "../pages/public/HomePage";
import FeaturesPage from "../pages/public/FeaturesPage";
import AboutPage from "../pages/public/AboutPage";
import ContactPage from "../pages/public/ContactPage";
import LoginPage from "../pages/public/LoginPage";
import RegisterPage from "../pages/public/RegisterPage";
import NotFoundPage from "../pages/NotFoundPage";
import DashboardPage from "../pages/app/DashboardPage";
import ProfilePage from "../pages/app/ProfilePage";
import ProductsPage from "../pages/app/ProductsPage";
import CategoriesPage from "../pages/app/CategoriesPage";
import WarehousesPage from "../pages/app/WarehousesPage";

// Every URL in the app.
//  - Public pages share PublicLayout (website header + footer)
//  - Staff-app pages share AppLayout and need a login; each page also lists
//    which roles may open it (PAGE_ACCESS in utils/navigation.js)
const AppRoutes = () => {
    return (
        <Routes>
            <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/about" element={<AboutPage />} />
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
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute roles={PAGE_ACCESS.dashboard}>
                            <DashboardPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/products"
                    element={
                        <ProtectedRoute roles={PAGE_ACCESS.products}>
                            <ProductsPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/categories"
                    element={
                        <ProtectedRoute roles={PAGE_ACCESS.categories}>
                            <CategoriesPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/warehouses"
                    element={
                        <ProtectedRoute roles={PAGE_ACCESS.warehouses}>
                            <WarehousesPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute roles={PAGE_ACCESS.profile}>
                            <ProfilePage />
                        </ProtectedRoute>
                    }
                />
            </Route>
        </Routes>
    );
};

export default AppRoutes;

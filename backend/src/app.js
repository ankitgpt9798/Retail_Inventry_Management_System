const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const warehouseRoutes = require("./routes/warehouseRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const transferRoutes = require("./routes/transferRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const orderRoutes = require("./routes/orderRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reportRoutes = require("./routes/reportRoutes");
const auditRoutes = require("./routes/auditRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// Behind a reverse proxy (nginx, a load balancer, a hosting platform) every request seems to come from the
// PROXY, so the per-address login limit would treat all users as one person. Set TRUST_PROXY to the number of
// proxies in front of the API (usually 1) so the real address is used. Left unset, the address is used as it is.
if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

// Protective response headers on EVERY response (this comes first so errors and CORS answers carry them too).
// helmet also removes "X-Powered-By: Express", which only tells an attacker what software to target.
app.use(
    helmet({
        // Only meaningful over HTTPS: on plain http://localhost browsers ignore it, so it is sent in production only
        strictTransportSecurity: process.env.NODE_ENV === "production",
        // The React app runs on another ORIGIN of the same site and reads our JSON through CORS; "same-site"
        // still stops other websites from embedding these responses
        crossOriginResourcePolicy: { policy: "same-site" }
    })
);

// API answers are personal, logged-in data: never let a browser or a shared proxy keep a copy
app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

// Allow the React app to call this API and send cookies along with requests
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json());

// Reads the Cookie header and fills req.cookies (needed to read the login token)
app.use(cookieParser());

// Simple check that the server is running
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Retail Inventory API is running",
        data: {}
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditRoutes);

// These two must stay last: they handle anything the routes above didn't
app.use(notFound);
app.use(errorHandler);

module.exports = app;

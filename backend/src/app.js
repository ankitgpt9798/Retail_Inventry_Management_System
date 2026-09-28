const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
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
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

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

// These two must stay last: they handle anything the routes above didn't
app.use(notFound);
app.use(errorHandler);

module.exports = app;

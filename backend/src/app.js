const express = require("express");
const cors = require("cors");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// Allow the React app to call this API and send cookies along with requests
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json());

// Simple check that the server is running
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Retail Inventory API is running",
        data: {}
    });
});

// Feature routes will be added here, e.g. app.use("/api/auth", authRoutes);

// These two must stay last: they handle anything the routes above didn't
app.use(notFound);
app.use(errorHandler);

module.exports = app;

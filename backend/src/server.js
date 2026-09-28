require("dotenv").config({ quiet: true });

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    // Without a secret, every login would crash with a confusing error, so stop early
    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is missing in .env");
        process.exit(1);
    }

    try {
        // Connect to the database first, so the API never runs without it
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
};

startServer();

const mongoose = require("mongoose");

const connectDB = async () => {
    // Fail after 5 seconds instead of Mongoose's default 30 if MongoDB isn't running
    const connection = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000
    });
    console.log(`MongoDB connected: ${connection.connection.name}`);
};

module.exports = connectDB;

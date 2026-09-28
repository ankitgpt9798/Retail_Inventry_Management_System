// Run with: npm run seed:admin
// Creates the first ADMIN account from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env.
// Public registration can never create an admin, so this is how the first one is made.
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const { hashPassword } = require("../services/authService");
const { passwordSchema } = require("../validators/authValidators");
const { ROLES, USER_STATUS } = require("./constants");

const seedAdmin = async () => {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    try {
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
            throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
        }

        // Admin passwords must follow the same rules as everyone else's
        const passwordCheck = passwordSchema.safeParse(ADMIN_PASSWORD);
        if (!passwordCheck.success) {
            throw new Error(`ADMIN_PASSWORD is too weak: ${passwordCheck.error.issues[0].message}`);
        }

        await connectDB();

        const existingUser = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
        if (existingUser) {
            console.log(`A user with email ${ADMIN_EMAIL} already exists (role: ${existingUser.role}). Nothing to do.`);
            return;
        }

        await User.create({
            name: ADMIN_NAME || "System Admin",
            email: ADMIN_EMAIL,
            password: await hashPassword(ADMIN_PASSWORD),
            role: ROLES.ADMIN,
            status: USER_STATUS.ACTIVE
        });

        console.log(`Admin created: ${ADMIN_EMAIL}`);
    }
    catch (error) {
        console.error("Failed to create admin:", error.message);
        process.exitCode = 1;
    }
    finally {
        await mongoose.disconnect();
    }
};

seedAdmin();

// Run with: npm run db:fix-notification-links
// One-off cleanup after a fix (E2E finding F2): notifications created earlier stored links to pages that
// don't exist in the app, so clicking them showed "Page not found":
//     low stock  → /inventory/<id>              →  /inventory
//     transfers  → /inventory/transfers/<id>    →  /transfers
// New notifications already get the right links; this corrects the ones already saved.
// Safe to run again: it only touches the "link" field, and only of notifications that still have an old link.
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Notification = require("../models/Notification");

const FIXES = [
    { label: "low stock", oldLink: /^\/inventory\/[0-9a-f]{24}$/, newLink: "/inventory" },
    { label: "transfer", oldLink: /^\/inventory\/transfers\/[0-9a-f]{24}$/, newLink: "/transfers" }
];

const fixNotificationLinks = async () => {
    try {
        await connectDB();

        let total = 0;
        for (const { label, oldLink, newLink } of FIXES) {
            const result = await Notification.updateMany({ link: oldLink }, { $set: { link: newLink } });
            console.log(`${label}: ${result.modifiedCount} notification(s) now link to ${newLink}`);
            total += result.modifiedCount;
        }
        console.log(total === 0 ? "Nothing to fix." : `Done: ${total} notification link(s) corrected.`);
    }
    catch (error) {
        console.error("Could not fix the notification links:", error.message);
        process.exitCode = 1;
    }
    finally {
        await mongoose.disconnect();
    }
};

fixNotificationLinks();

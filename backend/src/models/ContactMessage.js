const mongoose = require("mongoose");

// A message sent from the public Contact page. Visitors are not logged in,
// so their name and email are stored with the message.
const contactMessageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            maxlength: 100
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true
        },
        subject: {
            type: String,
            required: [true, "Subject is required"],
            trim: true,
            maxlength: 150
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
            maxlength: 2000
        }
    },
    { timestamps: true }
);

const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema, "contactMessages");

module.exports = ContactMessage;

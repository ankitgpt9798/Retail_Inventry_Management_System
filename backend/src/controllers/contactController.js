const ContactMessage = require("../models/ContactMessage");
const { notifyRoles } = require("../services/notificationService");
const { ROLES, NOTIFICATION_TYPE } = require("../utils/constants");

// POST /api/contact — public: saves the message and tells the admins in their notification inbox.
// (Small enough that it needs no service file: one save + one notification.)
const sendContactMessage = async (req, res) => {
    const contactMessage = await ContactMessage.create(req.body);

    await notifyRoles([ROLES.ADMIN], {
        type: NOTIFICATION_TYPE.SYSTEM_ALERT,
        title: `Contact form: ${contactMessage.subject}`,
        message: `${contactMessage.name} (${contactMessage.email}) wrote: ${contactMessage.message.slice(0, 200)}`
    });

    res.status(201).json({
        success: true,
        message: "Thank you — your message has been sent. We'll reply by email.",
        data: { id: contactMessage._id }
    });
};

module.exports = { sendContactMessage };

import { Clock, Mail, Phone, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { SITE_CONTACT } from "../../utils/siteInfo";

// Contact details only. (There is no "send a message" form, because the backend
// has no contact endpoint — a form that goes nowhere would mislead visitors.)
const ContactPage = () => {
    return (
        <>
            <section className="bg-base-200">
                <div className="mx-auto max-w-4xl px-4 py-16">
                    <h1 className="text-4xl font-extrabold tracking-tight">Contact</h1>
                    <p className="mt-3 text-lg text-base-content/70">Questions about your account or the system? Here's how to reach us.</p>
                </div>
            </section>

            <section className="mx-auto grid max-w-4xl gap-6 px-4 py-16 sm:grid-cols-2">
                <div className="rounded-box border border-base-300 p-6">
                    <Mail className="text-primary" size={24} aria-hidden="true" />
                    <h2 className="mt-3 font-semibold">Email</h2>
                    <p className="mt-1 text-base-content/70">{SITE_CONTACT.email}</p>
                </div>
                <div className="rounded-box border border-base-300 p-6">
                    <Phone className="text-primary" size={24} aria-hidden="true" />
                    <h2 className="mt-3 font-semibold">Phone</h2>
                    <p className="mt-1 text-base-content/70">{SITE_CONTACT.phone}</p>
                </div>
                <div className="rounded-box border border-base-300 p-6">
                    <Clock className="text-primary" size={24} aria-hidden="true" />
                    <h2 className="mt-3 font-semibold">Support hours</h2>
                    <p className="mt-1 text-base-content/70">{SITE_CONTACT.hours}</p>
                </div>
                <div className="rounded-box border border-base-300 p-6">
                    <UserPlus className="text-primary" size={24} aria-hidden="true" />
                    <h2 className="mt-3 font-semibold">Need an account?</h2>
                    <p className="mt-1 text-base-content/70">Request access and your administrator will approve it.</p>
                    <Link to="/register" className="btn btn-primary btn-sm mt-4">Request access</Link>
                </div>
            </section>
        </>
    );
};

export default ContactPage;

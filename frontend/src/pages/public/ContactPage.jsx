import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, Mail, MapPin, Phone, Send } from "lucide-react";
import TextField from "../../components/common/TextField";
import Alert from "../../components/common/Alert";
import api, { getErrorMessage } from "../../services/api";
import { SITE_CONTACT } from "../../utils/siteInfo";

// Same rules as the backend (backend/src/validators/contactValidators.js)
const contactSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
    email: z.email("Enter a valid email address"),
    subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150, "Subject is too long"),
    message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message is too long")
});

const EMPTY_FORM = { name: "", email: "", subject: "", message: "" };

const CONTACT_DETAILS = [
    { icon: Mail, label: "Email", value: SITE_CONTACT.email },
    { icon: Phone, label: "Phone", value: SITE_CONTACT.phone },
    { icon: MapPin, label: "Location", value: SITE_CONTACT.location },
    { icon: Clock, label: "Support hours", value: SITE_CONTACT.hours }
];

// Left: how to reach us. Right: a message form that is sent to POST /api/contact
// (the message is saved and every administrator gets a notification).
const ContactPage = () => {
    const [serverError, setServerError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting }
    } = useForm({ resolver: zodResolver(contactSchema), defaultValues: EMPTY_FORM });

    const messageLength = watch("message")?.length || 0;

    const onSubmit = async (values) => {
        setServerError("");
        setSuccessMessage("");
        try {
            const response = await api.post("/contact", values);
            setSuccessMessage(response.data.message);
            reset(EMPTY_FORM);
        }
        catch (err) {
            setServerError(getErrorMessage(err, "Your message could not be sent. Please try again."));
        }
    };

    return (
        <>
            <section className="bg-gradient-to-b from-primary-soft to-base-100">
                <div className="mx-auto max-w-7xl px-4 pb-6 pt-16 sm:px-6 lg:px-8">
                    <p className="text-sm font-semibold tracking-wide text-primary uppercase">Contact</p>
                    <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Get in touch</h1>
                    <p className="mt-3 max-w-2xl text-lg text-base-content/65">
                        Questions about your account, a demo for your stores, or something not working? We're happy to help.
                    </p>
                </div>
            </section>

            <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-5 lg:px-8">
                {/* Left: contact details */}
                <aside className="space-y-4 lg:col-span-2">
                    {CONTACT_DETAILS.map((item) => (
                        <div key={item.label} className="flex items-start gap-4 rounded-xl border border-base-300 bg-base-100 p-5 shadow-card">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                                <item.icon size={20} aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold">{item.label}</h2>
                                <p className="mt-0.5 break-words text-base-content/65">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </aside>

                {/* Right: the form */}
                <div className="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-card sm:p-8 lg:col-span-3">
                    <h2 className="text-xl font-semibold">Send us a message</h2>
                    <p className="mt-1 text-sm text-base-content/60">We usually reply within one working day.</p>

                    <div className="mt-5 space-y-3">
                        {successMessage && (
                            <Alert tone="success" title="Message sent" onDismiss={() => setSuccessMessage("")}>
                                {successMessage}
                            </Alert>
                        )}
                        {serverError && (
                            <Alert tone="error" title="Something went wrong">
                                {serverError}
                            </Alert>
                        )}
                    </div>

                    {/* noValidate: let Zod show our messages instead of the browser's */}
                    <form className="mt-5 grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)} noValidate>
                        <TextField label="Name" autoComplete="name" error={errors.name} {...register("name")} />
                        <TextField label="Email" type="email" autoComplete="email" error={errors.email} {...register("email")} />
                        <TextField label="Subject" className="sm:col-span-2" error={errors.subject} {...register("subject")} />
                        <div className="sm:col-span-2">
                            <label className="field-label" htmlFor="message">
                                Message
                            </label>
                            <textarea
                                id="message"
                                rows={6}
                                maxLength={2000}
                                className={`textarea ${errors.message ? "textarea-error" : ""}`}
                                aria-invalid={errors.message ? "true" : "false"}
                                {...register("message")}
                            />
                            <div className="flex justify-between gap-4">
                                {errors.message ? <p className="field-error">{errors.message.message}</p> : <p className="field-hint">At least 10 characters.</p>}
                                <p className="field-hint tabular-nums">{messageLength} / 2000</p>
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={isSubmitting}>
                                {isSubmitting ? <span className="spinner size-4" aria-hidden="true"></span> : <Send size={16} aria-hidden="true" />}
                                {isSubmitting ? "Sending…" : "Send Message"}
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </>
    );
};

export default ContactPage;

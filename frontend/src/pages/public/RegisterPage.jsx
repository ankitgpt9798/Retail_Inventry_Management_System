import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { MailCheck, UserPlus } from "lucide-react";
import TextField from "../../components/common/TextField";
import ErrorAlert from "../../components/common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { PASSWORD_HINT, passwordSchema } from "../../utils/passwordSchema";

const registerSchema = z
    .object({
        name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
        email: z.email("Enter a valid email address"),
        // Optional: an empty box is fine
        phone: z.string().trim().max(20, "Phone must be at most 20 characters"),
        password: passwordSchema,
        confirmPassword: z.string()
    })
    // Checks that need two fields go in a refine on the whole object
    .refine((values) => values.password === values.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"]
    });

// Public sign-up. The backend always creates a STAFF account in PENDING status;
// an administrator must approve it (and may change the role) before it can log in.
const RegisterPage = () => {
    const [serverError, setServerError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(registerSchema),
        defaultValues: { name: "", email: "", phone: "", password: "", confirmPassword: "" }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            // confirmPassword is only for this form; an empty phone is left out
            const body = { name: values.name, email: values.email, password: values.password };
            if (values.phone) {
                body.phone = values.phone;
            }
            const response = await api.post("/auth/register", body);
            setSuccessMessage(response.data.message);
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not send your request"));
        }
    };

    if (successMessage) {
        return (
            <section className="bg-base-200 px-4 py-16">
                <div className="mx-auto max-w-lg rounded-box border border-base-300 bg-base-100 p-10 text-center">
                    <MailCheck size={48} className="mx-auto text-success" aria-hidden="true" />
                    <h1 className="mt-4 text-2xl font-bold">Request sent</h1>
                    <p className="mt-2 text-base-content/70">{successMessage}</p>
                    <Link to="/" className="btn btn-primary mt-6">Back to the home page</Link>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-base-200 px-4 py-16">
            <div className="mx-auto max-w-lg rounded-box border border-base-300 bg-base-100 p-8 sm:p-10">
                <h1 className="text-2xl font-bold">Request access</h1>
                <p className="mt-1 text-sm text-base-content/70">
                    An administrator will review your request and choose your role.
                    Already have an account? <Link to="/login" className="link link-primary">Log in</Link>
                </p>

                <div className="mt-6">
                    <ErrorAlert message={serverError} />
                </div>

                <form className="mt-4 space-y-1" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <TextField label="Full name" autoComplete="name" error={errors.name} {...register("name")} />
                    <TextField label="Work email" type="email" autoComplete="email" error={errors.email} {...register("email")} />
                    <TextField label="Phone (optional)" type="tel" autoComplete="tel" error={errors.phone} {...register("phone")} />
                    <TextField
                        label="Password"
                        type="password"
                        autoComplete="new-password"
                        hint={PASSWORD_HINT}
                        error={errors.password}
                        {...register("password")}
                    />
                    <TextField
                        label="Confirm password"
                        type="password"
                        autoComplete="new-password"
                        error={errors.confirmPassword}
                        {...register("confirmPassword")}
                    />
                    <button type="submit" className="btn btn-primary mt-4 w-full" disabled={isSubmitting}>
                        {isSubmitting ? <span className="loading loading-spinner loading-sm"></span> : <UserPlus size={18} aria-hidden="true" />}
                        {isSubmitting ? "Sending…" : "Send request"}
                    </button>
                </form>
            </div>
        </section>
    );
};

export default RegisterPage;

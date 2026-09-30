import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import TextField from "../../components/common/TextField";
import ErrorAlert from "../../components/common/ErrorAlert";
import Alert from "../../components/common/Alert";
import { clearSessionMessage, loginUser } from "../../store/authSlice";
import { getHomePath } from "../../utils/navigation";

// Only "is it filled in?" checks here — the backend decides if the password is right
const loginSchema = z.object({
    email: z.email("Enter a valid email address"),
    password: z.string().min(1, "Enter your password")
});

const LoginPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, sessionMessage } = useSelector((state) => state.auth);
    const [serverError, setServerError] = useState("");

    // The page the user tried to open before being sent here (set by ProtectedRoute)
    const from = location.state?.from;

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({ resolver: zodResolver(loginSchema) });

    // Already logged in → no reason to see the login form
    if (user) {
        return <Navigate to={from || getHomePath(user.role)} replace />;
    }

    const onSubmit = async (values) => {
        setServerError("");
        try {
            // unwrap() gives the user on success, or throws the rejectWithValue message
            const loggedInUser = await dispatch(loginUser(values)).unwrap();
            dispatch(clearSessionMessage());
            navigate(from || getHomePath(loggedInUser.role), { replace: true });
        }
        catch (message) {
            // e.g. "Invalid email or password", "Your account is waiting for admin approval"
            setServerError(message);
        }
    };

    return (
        <section className="bg-gradient-to-b from-primary-soft to-base-200 px-4 py-12 sm:py-16">
            <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-raised md:grid-cols-2">
                <div className="hidden flex-col justify-between bg-primary p-10 text-primary-content md:flex">
                    <div>
                        <h2 className="text-2xl font-bold">Welcome back</h2>
                        <p className="mt-3 text-primary-content/80">
                            Log in to manage stock, orders and purchasing across all your warehouses.
                        </p>
                    </div>
                    <p className="text-sm text-primary-content/70">
                        Your session is kept in a secure cookie that scripts on this page can't read.
                    </p>
                </div>

                <div className="p-6 sm:p-10">
                    <h1 className="text-2xl font-bold">Log in</h1>
                    <p className="mt-1 text-sm text-base-content/70">
                        No account yet? <Link to="/register" className="link link-primary">Request access</Link>
                    </p>

                    <div className="mt-6 space-y-3">
                        {sessionMessage && !serverError && (
                            <Alert tone="warning">{sessionMessage}</Alert>
                        )}
                        <ErrorAlert message={serverError} />
                    </div>

                    {/* noValidate: let Zod show our messages instead of the browser's */}
                    <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                        <TextField
                            label="Email"
                            type="email"
                            autoComplete="email"
                            error={errors.email}
                            {...register("email")}
                        />
                        <TextField
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            error={errors.password}
                            {...register("password")}
                        />
                        <button type="submit" className="btn btn-primary mt-4 w-full" disabled={isSubmitting}>
                            {isSubmitting ? <span className="spinner size-4" aria-hidden="true"></span> : <LogIn size={18} aria-hidden="true" />}
                            {isSubmitting ? "Logging in…" : "Log in"}
                        </button>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default LoginPage;

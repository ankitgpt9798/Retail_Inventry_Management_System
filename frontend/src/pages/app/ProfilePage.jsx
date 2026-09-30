import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Clock, KeyRound, Mail, Pencil, Phone, ShieldCheck, UserCheck, UserRound } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import TextField from "../../components/common/TextField";
import ErrorAlert from "../../components/common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { loggedOutWithMessage, userUpdated } from "../../store/authSlice";
import { formatRole } from "../../utils/roles";
import { formatDateTime } from "../../utils/format";
import { PASSWORD_HINT, passwordSchema } from "../../utils/passwordSchema";
import Alert from "../../components/common/Alert";
import Badge from "../../components/common/Badge";

const profileSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
    phone: z.string().trim().max(20, "Phone must be at most 20 characters")
});

const passwordFormSchema = z
    .object({
        currentPassword: z.string().min(1, "Enter your current password"),
        newPassword: passwordSchema,
        confirmPassword: z.string()
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"]
    });

// Initials for the avatar: "Ravi Kumar" → "RK"
const getInitials = (name = "") => {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
};

// Small square icon shown next to each card title
const CardIcon = ({ icon: Icon }) => {
    return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon size={18} aria-hidden="true" />
        </span>
    );
};

// One line of the "Account information" list: icon, label, value
const InfoRow = ({ icon: Icon, label, children }) => {
    return (
        <div className="flex items-start gap-3 py-3">
            <Icon size={16} className="mt-0.5 shrink-0 text-base-content/45" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-base-content/55">{label}</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-base-content">{children}</dd>
            </div>
        </div>
    );
};

// ---------- Name and phone ----------
const ProfileDetailsForm = ({ user }) => {
    const dispatch = useDispatch();
    const [serverError, setServerError] = useState("");
    const [saved, setSaved] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting, isDirty },
        reset
    } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: { name: user.name, phone: user.phone || "" }
    });

    const onSubmit = async (values) => {
        setServerError("");
        setSaved(false);
        try {
            const response = await api.put("/users/profile", values);
            const updatedUser = response.data.data.user;
            // Update Redux so the name in the top bar changes too
            dispatch(userUpdated(updatedUser));
            reset({ name: updatedUser.name, phone: updatedUser.phone || "" });
            setSaved(true);
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save your profile"));
        }
    };

    return (
        <form id="profile-details" className="card scroll-mt-24" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="card-body gap-4">
                <div className="flex items-center gap-3">
                    <CardIcon icon={UserRound} />
                    <div>
                        <h2 className="card-title">Your details</h2>
                        <p className="text-sm text-base-content/60">Update your name and phone number.</p>
                    </div>
                </div>
                <ErrorAlert message={serverError} />
                {saved && <Alert tone="success">Profile saved.</Alert>}
                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Full name" error={errors.name} {...register("name")} />
                    <TextField label="Phone" type="tel" error={errors.phone} {...register("phone")} />
                </div>
                <div className="form-actions mt-0">
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting || !isDirty}>
                        {isSubmitting ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </div>
        </form>
    );
};

// ---------- Password ----------
const ChangePasswordForm = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" }
    });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            await api.put("/users/profile/password", {
                currentPassword: values.currentPassword,
                newPassword: values.newPassword
            });
            // The backend logs you out on every device (including this one)
            dispatch(loggedOutWithMessage("Password changed. Please log in with your new password."));
            navigate("/login", { replace: true });
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not change your password"));
        }
    };

    return (
        <form className="card" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="card-body gap-4">
                <div className="flex items-center gap-3">
                    <CardIcon icon={KeyRound} />
                    <div>
                        <h2 className="card-title">Change password</h2>
                        <p className="text-sm text-base-content/60">You'll be logged out on all devices afterwards.</p>
                    </div>
                </div>
                <ErrorAlert message={serverError} />
                <TextField label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword} {...register("currentPassword")} />
                <TextField label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={errors.newPassword} {...register("newPassword")} />
                <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirmPassword} {...register("confirmPassword")} />
                <div className="form-actions mt-0">
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? "Changing…" : "Change password"}
                    </button>
                </div>
            </div>
        </form>
    );
};

const ProfilePage = () => {
    const user = useSelector((state) => state.auth.user);
    const isActive = user.status === "ACTIVE";

    // "Edit profile" scrolls to the details form and puts the cursor in the name field
    const handleEditClick = () => {
        const form = document.getElementById("profile-details");
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        form?.querySelector("input")?.focus({ preventScroll: true });
    };

    return (
        <>
            <PageHeader title="My profile" description="Your account details and password." />

            {/* Profile summary: avatar, name, email and role */}
            <section className="card mb-6 overflow-hidden">
                <div className="h-20 bg-gradient-to-r from-primary to-violet-500 sm:h-24" aria-hidden="true"></div>
                <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pb-6">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                        <span className="-mt-10 flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-base-100 bg-primary text-2xl font-bold text-primary-content shadow-card sm:-mt-12 sm:size-24 sm:text-3xl">
                            {getInitials(user.name) || <UserRound size={32} aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 sm:pb-1">
                            <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{user.name}</h2>
                            <p className="flex min-w-0 items-center gap-1.5 text-sm text-base-content/60">
                                <Mail size={14} className="shrink-0" aria-hidden="true" />
                                <span className="truncate">{user.email}</span>
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Badge tone="primary">{formatRole(user.role)}</Badge>
                                <Badge tone={isActive ? "success" : "warning"}>{formatRole(user.status)}</Badge>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="btn btn-primary self-start sm:self-auto" onClick={handleEditClick}>
                        <Pencil size={16} aria-hidden="true" /> Edit profile
                    </button>
                </div>
            </section>

            <div className="grid gap-6 *:min-w-0 lg:grid-cols-3">
                <div className="card self-start">
                    <div className="card-body">
                        <div className="flex items-center gap-3">
                            <CardIcon icon={ShieldCheck} />
                            <h2 className="card-title">Account information</h2>
                        </div>
                        <dl className="divide-y divide-base-300">
                            <InfoRow icon={Mail} label="Email">{user.email}</InfoRow>
                            <InfoRow icon={Phone} label="Phone">{user.phone || <span className="text-base-content/50">Not added</span>}</InfoRow>
                            <InfoRow icon={ShieldCheck} label="Role">{formatRole(user.role)}</InfoRow>
                            <InfoRow icon={UserCheck} label="Status">{formatRole(user.status)}</InfoRow>
                            <InfoRow icon={CalendarDays} label="Member since">{formatDateTime(user.createdAt)}</InfoRow>
                            <InfoRow icon={Clock} label="Last login">{formatDateTime(user.lastLoginAt)}</InfoRow>
                        </dl>
                        <p className="rounded-lg bg-base-200 px-3 py-2 text-xs text-base-content/60">Your email and role can only be changed by an administrator.</p>
                    </div>
                </div>

                <div className="space-y-6 lg:col-span-2">
                    <ProfileDetailsForm user={user} />
                    <ChangePasswordForm />
                </div>
            </div>
        </>
    );
};

export default ProfilePage;

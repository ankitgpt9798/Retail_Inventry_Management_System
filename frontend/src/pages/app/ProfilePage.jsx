import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import TextField from "../../components/common/TextField";
import ErrorAlert from "../../components/common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { loggedOutWithMessage, userUpdated } from "../../store/authSlice";
import { formatRole } from "../../utils/roles";
import { formatDateTime } from "../../utils/format";
import { PASSWORD_HINT, passwordSchema } from "../../utils/passwordSchema";

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
        <form className="card border border-base-300 bg-base-100" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="card-body">
                <h2 className="card-title">Your details</h2>
                <ErrorAlert message={serverError} />
                {saved && <div role="status" className="alert alert-success alert-soft">Profile saved.</div>}
                <TextField label="Full name" error={errors.name} {...register("name")} />
                <TextField label="Phone" type="tel" error={errors.phone} {...register("phone")} />
                <div className="card-actions mt-2 justify-end">
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
        <form className="card border border-base-300 bg-base-100" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="card-body">
                <h2 className="card-title">Change password</h2>
                <p className="text-sm text-base-content/70">You'll be logged out on all devices afterwards.</p>
                <ErrorAlert message={serverError} />
                <TextField label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword} {...register("currentPassword")} />
                <TextField label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={errors.newPassword} {...register("newPassword")} />
                <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirmPassword} {...register("confirmPassword")} />
                <div className="card-actions mt-2 justify-end">
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

    return (
        <>
            <PageHeader title="My profile" description="Your account details and password." />

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="card border border-base-300 bg-base-100">
                    <div className="card-body">
                        <h2 className="card-title">Account</h2>
                        <dl className="space-y-3 text-sm">
                            <div><dt className="text-base-content/60">Email</dt><dd className="font-medium">{user.email}</dd></div>
                            <div><dt className="text-base-content/60">Role</dt><dd><span className="badge badge-primary badge-soft">{formatRole(user.role)}</span></dd></div>
                            <div><dt className="text-base-content/60">Status</dt><dd className="font-medium">{formatRole(user.status)}</dd></div>
                            <div><dt className="text-base-content/60">Member since</dt><dd>{formatDateTime(user.createdAt)}</dd></div>
                            <div><dt className="text-base-content/60">Last login</dt><dd>{formatDateTime(user.lastLoginAt)}</dd></div>
                        </dl>
                        <p className="mt-2 text-xs text-base-content/60">Your email and role can only be changed by an administrator.</p>
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

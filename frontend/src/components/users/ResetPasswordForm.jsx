import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { PASSWORD_HINT, passwordSchema } from "../../utils/passwordSchema";

const resetSchema = z
    .object({ newPassword: passwordSchema, confirmPassword: z.string() })
    .refine((values) => values.newPassword === values.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

// An admin sets a new password for someone who forgot theirs (the user is logged out everywhere)
const ResetPasswordForm = ({ user, onSaved, onClose }) => {
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { newPassword: "", confirmPassword: "" } });

    const onSubmit = async (values) => {
        setServerError("");
        try {
            await api.put(`/users/${user._id}/password`, { newPassword: values.newPassword });
            onSaved(`Password reset for ${user.name}. They must log in again.`);
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not reset the password"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <p className="mb-2 text-sm text-base-content/70">Choose a new password for {user.name}. Tell them the new password yourself.</p>
            <ErrorAlert message={serverError} />
            <TextField label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={errors.newPassword} {...register("newPassword")} />
            <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirmPassword} {...register("confirmPassword")} />
            <div className="form-actions">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Reset password"}
                </button>
            </div>
        </form>
    );
};

export default ResetPasswordForm;

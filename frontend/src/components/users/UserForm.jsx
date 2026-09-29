import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import SelectField from "../common/SelectField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";
import { formatRole, ROLES } from "../../utils/roles";
import { PASSWORD_HINT, passwordSchema } from "../../utils/passwordSchema";

// Same rules as the backend (validators/userValidators.js) for quick feedback
const baseFields = {
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be at most 100 characters"),
    email: z.email("Email is not valid"),
    phone: z.string().trim().max(20, "Phone must be at most 20 characters"),
    role: z.enum(Object.values(ROLES), { error: "Choose a role" }),
    supplier: z.string(),
    status: z.string()
};

// A supplier user must belong to a supplier company
const needsSupplier = (values, context) => {
    if (values.role === ROLES.SUPPLIER && !values.supplier) {
        context.addIssue({ code: "custom", path: ["supplier"], message: "Choose the supplier company this user belongs to" });
    }
};

const createSchema = z.object({ ...baseFields, password: passwordSchema }).superRefine(needsSupplier);
const editSchema = z.object(baseFields).superRefine(needsSupplier);

// A value the user may see but not change. The real (hidden) input goes in as `children`,
// so the form still has the value when it is submitted.
const LockedField = ({ label, value, hint, children }) => (
    <fieldset className="fieldset">
        <legend className="fieldset-legend">{label}</legend>
        {children}
        <input className="input w-full" value={value} readOnly aria-label={label} />
        <p className="label">{hint}</p>
    </fieldset>
);

// Create (user = null) or edit (user = the row being edited).
//   suppliers: ACTIVE suppliers to choose from (for SUPPLIER users)
//   isSelf:    true when the admin edits their OWN account: role and status are locked (the backend refuses those changes)
const UserForm = ({ user, suppliers, isSelf = false, onSaved, onClose }) => {
    const isEdit = Boolean(user);
    const [serverError, setServerError] = useState("");

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(isEdit ? editSchema : createSchema),
        defaultValues: {
            name: user?.name || "",
            email: user?.email || "",
            phone: user?.phone || "",
            role: user?.role || ROLES.STAFF,
            supplier: user?.supplier?._id || "",
            status: user?.status || "ACTIVE",
            password: ""
        }
    });

    const role = useWatch({ control, name: "role" });

    // Keep the user's current supplier in the list even if it was deactivated since
    const supplierOptions =
        user?.supplier && !suppliers.some((supplier) => supplier._id === user.supplier._id) ? [...suppliers, user.supplier] : suppliers;

    const onSubmit = async (values) => {
        setServerError("");
        const isSupplierUser = values.role === ROLES.SUPPLIER;

        try {
            if (isEdit) {
                const payload = { name: values.name, email: values.email, phone: values.phone };
                if (!isSelf) {
                    payload.role = values.role;
                    // Only send a status change; a PENDING user left as PENDING is not touched
                    if (values.status !== user.status && values.status !== "PENDING") payload.status = values.status;
                }
                if (isSupplierUser) payload.supplier = values.supplier;
                else if (user.supplier) payload.supplier = null; // moved away from the SUPPLIER role
                await api.put(`/users/${user._id}`, payload);
            }
            else {
                const payload = { name: values.name, email: values.email, phone: values.phone, password: values.password, role: values.role };
                if (isSupplierUser) payload.supplier = values.supplier;
                await api.post("/users", payload);
            }
            onSaved(isEdit ? "User updated." : "User created.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the user"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <ErrorAlert message={serverError} />
            <div className="grid gap-x-4 sm:grid-cols-2">
                <TextField label="Full name" error={errors.name} {...register("name")} />
                <TextField label="Email" type="email" autoComplete="off" error={errors.email} {...register("email")} />
                <TextField label="Phone (optional)" type="tel" error={errors.phone} {...register("phone")} />
                {isSelf ? (
                    <LockedField label="Role" value={formatRole(user.role)} hint="You can't change your own role">
                        <input type="hidden" {...register("role")} />
                    </LockedField>
                ) : (
                    <SelectField label="Role" error={errors.role} {...register("role")}>
                        {Object.values(ROLES).map((value) => (
                            <option key={value} value={value}>
                                {formatRole(value)}
                            </option>
                        ))}
                    </SelectField>
                )}
                {role === ROLES.SUPPLIER && (
                    <SelectField label="Supplier company" error={errors.supplier} {...register("supplier")}>
                        <option value="">Choose a supplier…</option>
                        {supplierOptions.map((supplier) => (
                            <option key={supplier._id} value={supplier._id}>
                                {supplier.name}
                            </option>
                        ))}
                    </SelectField>
                )}
                {isEdit ? (
                    isSelf ? (
                        <LockedField label="Status" value={formatRole(user.status)} hint="You can't change your own status">
                            <input type="hidden" {...register("status")} />
                        </LockedField>
                    ) : (
                        <SelectField label="Status" error={errors.status} {...register("status")}>
                            {user.status === "PENDING" && <option value="PENDING">Pending approval</option>}
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                        </SelectField>
                    )
                ) : (
                    <TextField label="Password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={errors.password} {...register("password")} />
                )}
            </div>
            <div className="modal-action">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create user"}
                </button>
            </div>
        </form>
    );
};

export default UserForm;

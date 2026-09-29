import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TextField from "../common/TextField";
import ErrorAlert from "../common/ErrorAlert";
import api, { getErrorMessage } from "../../services/api";

// Same rules as the backend (validators/supplierValidators.js) for quick feedback
const supplierSchema = z.object({
    name: z.string().trim().min(2, "Supplier name must be at least 2 characters").max(200, "Supplier name must be at most 200 characters"),
    contactPerson: z.string().trim().max(100, "Contact person must be at most 100 characters"),
    email: z.email("Email is not valid"),
    // Empty is fine (optional); otherwise the backend's phone rule
    phone: z.union([
        z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, "Phone must be 7-20 characters: digits, spaces, +, - or brackets"),
        z.literal("")
    ]),
    city: z.string().trim().max(100, "City must be at most 100 characters"),
    address: z.string().trim().max(300, "Address must be at most 300 characters")
});

// Create (supplier = null) or edit (supplier = the row being edited)
const SupplierForm = ({ supplier, onSaved, onClose }) => {
    const isEdit = Boolean(supplier);
    const [serverError, setServerError] = useState("");

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({
        resolver: zodResolver(supplierSchema),
        defaultValues: {
            name: supplier?.name || "",
            contactPerson: supplier?.contactPerson || "",
            email: supplier?.email || "",
            phone: supplier?.phone || "",
            city: supplier?.city || "",
            address: supplier?.address || ""
        }
    });

    const onSubmit = async (values) => {
        setServerError("");
        // The backend rejects an empty phone number, so an empty one is simply not sent
        const { phone, ...rest } = values;
        const payload = phone ? { ...rest, phone } : rest;
        try {
            if (isEdit) {
                await api.put(`/suppliers/${supplier._id}`, payload);
            }
            else {
                await api.post("/suppliers", payload);
            }
            onSaved(isEdit ? "Supplier updated." : "Supplier created.");
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the supplier"));
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <ErrorAlert message={serverError} />
            <div className="grid gap-x-4 sm:grid-cols-2">
                <TextField label="Company name" error={errors.name} {...register("name")} />
                <TextField label="Contact person (optional)" error={errors.contactPerson} {...register("contactPerson")} />
                <TextField label="Email" type="email" error={errors.email} {...register("email")} />
                <TextField label="Phone (optional)" type="tel" error={errors.phone} {...register("phone")} />
                <TextField label="City (optional)" error={errors.city} {...register("city")} />
                <TextField label="Address (optional)" error={errors.address} {...register("address")} />
            </div>
            <div className="modal-action">
                <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create supplier"}
                </button>
            </div>
        </form>
    );
};

export default SupplierForm;

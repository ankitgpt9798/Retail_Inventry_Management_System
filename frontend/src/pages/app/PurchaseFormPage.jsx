import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import TextField from "../../components/common/TextField";
import SelectField from "../../components/common/SelectField";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { formatCurrency } from "../../utils/format";

// Same rules as the backend (validators/purchaseValidators.js) for quick feedback
const purchaseSchema = z.object({
    supplier: z.string().min(1, "Choose a supplier"),
    warehouse: z.string().min(1, "Choose a warehouse"),
    expectedDeliveryDate: z.string(),
    notes: z.string().trim().max(1000, "Notes must be at most 1000 characters"),
    items: z
        .array(
            z.object({
                product: z.string().min(1, "Choose a product"),
                quantityOrdered: z
                    .number({ error: "Quantity must be a number" })
                    .int("Quantity must be a whole number")
                    .min(1, "Quantity must be at least 1")
                    .max(1000000, "Quantity is too large"),
                // An empty box gives NaN: that means "use the product's cost price"
                unitCost: z.union([z.nan(), z.number({ error: "Unit cost must be a number" }).min(0, "Unit cost cannot be negative")])
            })
        )
        .min(1, "Purchase order must contain at least one item")
        .max(50, "Purchase order can contain at most 50 items")
        .refine((items) => new Set(items.map((item) => item.product)).size === items.length, {
            message: "Each product can appear only once; change its quantity instead"
        })
});

const emptyLine = { product: "", quantityOrdered: 1, unitCost: NaN };

// What the API expects. Empty optional fields are left out.
const buildPayload = (values) => {
    const payload = {
        supplier: values.supplier,
        warehouse: values.warehouse,
        items: values.items.map((item) => ({
            product: item.product,
            quantityOrdered: item.quantityOrdered,
            ...(Number.isNaN(item.unitCost) ? {} : { unitCost: item.unitCost })
        })),
        notes: values.notes
    };
    if (values.expectedDeliveryDate) payload.expectedDeliveryDate = values.expectedDeliveryDate;
    return payload;
};

// Create (/purchases/new) or edit a DRAFT (/purchases/:id/edit)
const PurchaseFormPage = () => {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const suppliers = useOptions("/suppliers", "suppliers", { status: "ACTIVE" });
    const warehouses = useOptions("/warehouses", "warehouses", { status: "ACTIVE" });
    const products = useOptions("/products", "products", { status: "ACTIVE" });

    const [purchase, setPurchase] = useState(null);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [loadError, setLoadError] = useState("");
    const [serverError, setServerError] = useState("");

    useEffect(() => {
        if (!isEdit) return;
        api.get(`/purchases/${id}`)
            .then((response) => setPurchase(response.data.data.purchase))
            .catch((error) => setLoadError(getErrorMessage(error, "Could not load the purchase order")))
            .finally(() => setIsLoading(false));
    }, [id, isEdit]);

    if (isLoading) return <Loader text="Loading purchase order…" />;
    if (loadError) return <ErrorAlert message={loadError} />;
    if (isEdit && purchase.status !== "DRAFT") {
        return (
            <>
                <PageHeader title={`Edit ${purchase.poNumber}`} />
                <div role="alert" className="alert alert-warning alert-soft">
                    Only draft purchase orders can be edited. This one is {purchase.status.toLowerCase().replace("_", " ")}.
                </div>
                <Link to={`/purchases/${id}`} className="btn mt-4">
                    Back to the purchase order
                </Link>
            </>
        );
    }

    const defaults = purchase
        ? {
            supplier: purchase.supplier?._id || "",
            warehouse: purchase.warehouse?._id || "",
            expectedDeliveryDate: purchase.expectedDeliveryDate ? purchase.expectedDeliveryDate.slice(0, 10) : "",
            notes: purchase.notes || "",
            items: purchase.items.map((item) => ({
                product: item.product?._id || item.product,
                quantityOrdered: item.quantityOrdered,
                unitCost: item.unitCost
            }))
        }
        : { supplier: "", warehouse: "", expectedDeliveryDate: "", notes: "", items: [emptyLine] };

    const save = async (values, { submit }) => {
        setServerError("");
        try {
            const payload = buildPayload(values);
            const response = isEdit
                ? await api.put(`/purchases/${id}`, payload)
                : await api.post("/purchases", { ...payload, ...(submit ? { submit: true } : {}) });
            const saved = response.data.data.purchase;

            // Editing a draft and asking to submit it too: the update keeps it a DRAFT, so submit it now
            if (isEdit && submit) {
                await api.put(`/purchases/${saved._id}/submit`);
            }
            navigate(`/purchases/${saved._id}`, { replace: true });
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the purchase order"));
        }
    };

    return (
        <>
            <PageHeader title={isEdit ? `Edit ${purchase.poNumber}` : "New purchase order"} description="A draft can be changed until you submit it for approval.">
                <Link to={isEdit ? `/purchases/${id}` : "/purchases"} className="btn">
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                </Link>
            </PageHeader>
            <PurchaseForm
                // The drop-downs can only show a saved value once their options exist, so the form is
                // built again when the options have arrived (see OrderFormPage for the same trick)
                key={`${id || "new"}-${suppliers.length}-${warehouses.length}-${products.length}`}
                defaults={defaults}
                isEdit={isEdit}
                suppliers={suppliers}
                warehouses={warehouses}
                products={products}
                serverError={serverError}
                onSave={save}
            />
        </>
    );
};

const PurchaseForm = ({ defaults, isEdit, suppliers, warehouses, products, serverError, onSave }) => {
    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({ resolver: zodResolver(purchaseSchema), defaultValues: defaults });

    const { fields, append, remove } = useFieldArray({ control, name: "items" });
    const watchedItems = useWatch({ control, name: "items" }) || [];

    // A rough total: the entered unit cost, or else the product's cost price
    const estimate = watchedItems.reduce((sum, item) => {
        const product = products.find((p) => p._id === item.product);
        if (!product || !Number.isFinite(item.quantityOrdered)) return sum;
        const cost = Number.isFinite(item.unitCost) ? item.unitCost : product.costPrice;
        return sum + cost * item.quantityOrdered;
    }, 0);

    const itemsError = errors.items?.message || errors.items?.root?.message;

    return (
        <form noValidate className="space-y-6">
            <ErrorAlert message={serverError} />

            <div className="card border border-base-300 bg-base-100">
                <div className="card-body">
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <SelectField label="Supplier" error={errors.supplier} {...register("supplier")}>
                            <option value="">Choose a supplier…</option>
                            {suppliers.map((supplier) => (
                                <option key={supplier._id} value={supplier._id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </SelectField>
                        <SelectField label="Deliver to warehouse" error={errors.warehouse} {...register("warehouse")}>
                            <option value="">Choose a warehouse…</option>
                            {warehouses.map((warehouse) => (
                                <option key={warehouse._id} value={warehouse._id}>
                                    {warehouse.name} ({warehouse.code})
                                </option>
                            ))}
                        </SelectField>
                        <TextField label="Expected delivery date (optional)" type="date" error={errors.expectedDeliveryDate} {...register("expectedDeliveryDate")} />
                        <TextField label="Notes (optional)" error={errors.notes} {...register("notes")} />
                    </div>
                </div>
            </div>

            <div className="card border border-base-300 bg-base-100">
                <div className="card-body">
                    <h2 className="card-title">Items</h2>
                    {itemsError && <p className="text-sm text-error" role="alert">{itemsError}</p>}

                    <div className="space-y-3">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid items-start gap-3 sm:grid-cols-[1fr_7rem_9rem_auto]">
                                <SelectField label={`Product ${index + 1}`} error={errors.items?.[index]?.product} {...register(`items.${index}.product`)}>
                                    <option value="">Choose a product…</option>
                                    {products.map((product) => (
                                        <option key={product._id} value={product._id}>
                                            {product.name} ({product.sku}) — cost {formatCurrency(product.costPrice)}
                                        </option>
                                    ))}
                                </SelectField>
                                <TextField
                                    label={`Quantity ${index + 1}`}
                                    type="number"
                                    error={errors.items?.[index]?.quantityOrdered}
                                    {...register(`items.${index}.quantityOrdered`, { valueAsNumber: true })}
                                />
                                <TextField
                                    label={`Unit cost ${index + 1}`}
                                    type="number"
                                    step="0.01"
                                    hint="Empty = product cost"
                                    error={errors.items?.[index]?.unitCost}
                                    {...register(`items.${index}.unitCost`, { valueAsNumber: true })}
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-square self-center text-error"
                                    onClick={() => remove(index)}
                                    disabled={fields.length === 1}
                                    aria-label={`Remove item ${index + 1}`}
                                >
                                    <Trash2 size={16} aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <button type="button" className="btn btn-sm" onClick={() => append(emptyLine)} disabled={fields.length >= 50}>
                            <Plus size={14} aria-hidden="true" /> Add item
                        </button>
                        <p className="text-sm text-base-content/70" data-testid="estimate">
                            Estimated total: <strong>{formatCurrency(estimate)}</strong>
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
                <button type="button" className="btn" disabled={isSubmitting} onClick={handleSubmit((values) => onSave(values, { submit: false }))}>
                    {isEdit ? "Save changes" : "Save as draft"}
                </button>
                <button type="button" className="btn btn-primary" disabled={isSubmitting} onClick={handleSubmit((values) => onSave(values, { submit: true }))}>
                    {isSubmitting ? "Saving…" : "Save and submit for approval"}
                </button>
            </div>
        </form>
    );
};

export default PurchaseFormPage;

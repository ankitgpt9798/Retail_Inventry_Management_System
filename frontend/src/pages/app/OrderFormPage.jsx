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

// Same rules as the backend (validators/orderValidators.js) for quick feedback
const orderSchema = z.object({
    customerName: z.string().trim().min(2, "Customer name must be at least 2 characters").max(100, "Customer name must be at most 100 characters"),
    customerEmail: z.union([z.email("Customer email is not valid"), z.literal("")]),
    customerPhone: z.union([
        z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, "Phone must be 7-20 characters: digits, spaces, +, - or brackets"),
        z.literal("")
    ]),
    customerAddress: z.string().trim().max(300, "Address must be at most 300 characters"),
    warehouse: z.string().min(1, "Choose a warehouse"),
    notes: z.string().trim().max(1000, "Notes must be at most 1000 characters"),
    items: z
        .array(
            z.object({
                product: z.string().min(1, "Choose a product"),
                quantity: z
                    .number({ error: "Quantity must be a number" })
                    .int("Quantity must be a whole number")
                    .min(1, "Quantity must be at least 1")
                    .max(10000, "Quantity is too large for one order")
            })
        )
        .min(1, "Order must contain at least one item")
        .max(50, "Order can contain at most 50 items")
        .refine((items) => new Set(items.map((item) => item.product)).size === items.length, {
            message: "Each product can appear only once; change its quantity instead"
        })
});

const emptyLine = { product: "", quantity: 1 };

// Turns the form values into what the API expects. Empty optional fields are left out,
// because the backend would reject e.g. an empty e-mail address.
const buildPayload = (values) => {
    const customer = { name: values.customerName };
    if (values.customerEmail) customer.email = values.customerEmail;
    if (values.customerPhone) customer.phone = values.customerPhone;
    if (values.customerAddress) customer.address = values.customerAddress;

    return {
        customer,
        warehouse: values.warehouse,
        items: values.items.map((item) => ({ product: item.product, quantity: item.quantity })),
        notes: values.notes
    };
};

// Create (/orders/new) or edit a PENDING order (/orders/:id/edit)
const OrderFormPage = () => {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const products = useOptions("/products", "products", { status: "ACTIVE" });
    const warehouses = useOptions("/warehouses", "warehouses", { status: "ACTIVE" });

    // When editing: load the order first, then build the form from it
    const [loaded, setLoaded] = useState(null); // { order, items }
    const [isLoading, setIsLoading] = useState(isEdit);
    const [loadError, setLoadError] = useState("");
    const [serverError, setServerError] = useState("");

    useEffect(() => {
        if (!isEdit) return;
        api.get(`/orders/${id}`)
            .then((response) => setLoaded(response.data.data))
            .catch((error) => setLoadError(getErrorMessage(error, "Could not load the order")))
            .finally(() => setIsLoading(false));
    }, [id, isEdit]);

    if (isLoading) {
        return <Loader text="Loading order…" />;
    }
    if (loadError) {
        return <ErrorAlert message={loadError} />;
    }
    if (isEdit && loaded.order.status !== "PENDING") {
        return (
            <>
                <PageHeader title={`Edit ${loaded.order.orderNumber}`} />
                <div role="alert" className="alert alert-warning alert-soft">
                    Only pending orders can be edited. This order is {loaded.order.status.toLowerCase()}.
                </div>
                <Link to={`/orders/${id}`} className="btn mt-4">
                    Back to the order
                </Link>
            </>
        );
    }

    const defaults = loaded
        ? {
            customerName: loaded.order.customer?.name || "",
            customerEmail: loaded.order.customer?.email || "",
            customerPhone: loaded.order.customer?.phone || "",
            customerAddress: loaded.order.customer?.address || "",
            warehouse: loaded.order.warehouse?._id || "",
            notes: loaded.order.notes || "",
            items: loaded.items.map((item) => ({ product: item.product?._id || item.product, quantity: item.quantity }))
        }
        : {
            customerName: "", customerEmail: "", customerPhone: "", customerAddress: "",
            warehouse: "", notes: "", items: [emptyLine]
        };

    const save = async (values, { confirm }) => {
        setServerError("");
        try {
            const payload = buildPayload(values);
            const response = isEdit
                ? await api.put(`/orders/${id}`, payload)
                : await api.post("/orders", { ...payload, ...(confirm ? { confirm: true } : {}) });
            navigate(`/orders/${response.data.data.order._id}`, { replace: true });
        }
        catch (error) {
            setServerError(getErrorMessage(error, "Could not save the order"));
        }
    };

    return (
        <>
            <PageHeader title={isEdit ? `Edit ${loaded.order.orderNumber}` : "New order"} description="Prices come from the product list when the order is saved.">
                <Link to={isEdit ? `/orders/${id}` : "/orders"} className="btn">
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                </Link>
            </PageHeader>
            <OrderForm
                // A drop-down can only show a saved value once its options exist. The options arrive
                // a moment after the page opens, so build the form again when they have (edit mode
                // would otherwise show empty product / warehouse drop-downs).
                key={`${id || "new"}-${products.length}-${warehouses.length}`}
                defaults={defaults}
                isEdit={isEdit}
                products={products}
                warehouses={warehouses}
                serverError={serverError}
                onSave={save}
            />
        </>
    );
};

// The form itself. Split out so it is built once, AFTER the order (when editing) has loaded.
const OrderForm = ({ defaults, isEdit, products, warehouses, serverError, onSave }) => {
    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm({ resolver: zodResolver(orderSchema), defaultValues: defaults });

    const { fields, append, remove } = useFieldArray({ control, name: "items" });
    const watchedItems = useWatchedItems(control);

    // A rough total for the person typing. The server calculates the real one.
    const estimate = watchedItems.reduce(
        (sum, item) => {
            const product = products.find((p) => p._id === item.product);
            if (!product || !Number.isFinite(item.quantity)) return sum;
            const subtotal = product.sellingPrice * item.quantity;
            return { subtotal: sum.subtotal + subtotal, tax: sum.tax + (subtotal * (product.taxRate || 0)) / 100 };
        },
        { subtotal: 0, tax: 0 }
    );

    // A list-level error (e.g. "Each product can appear only once") sits on `items` itself
    const itemsError = errors.items?.message || errors.items?.root?.message;

    return (
        <form noValidate className="space-y-6">
            <ErrorAlert message={serverError} />

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="card border border-base-300 bg-base-100">
                    <div className="card-body">
                        <h2 className="card-title">Customer</h2>
                        <TextField label="Name" error={errors.customerName} {...register("customerName")} />
                        <TextField label="Email (optional)" type="email" error={errors.customerEmail} {...register("customerEmail")} />
                        <TextField label="Phone (optional)" type="tel" error={errors.customerPhone} {...register("customerPhone")} />
                        <TextField label="Address (optional)" error={errors.customerAddress} {...register("customerAddress")} />
                    </div>
                </div>

                <div className="card border border-base-300 bg-base-100">
                    <div className="card-body">
                        <h2 className="card-title">Fulfilled from</h2>
                        <SelectField label="Warehouse" error={errors.warehouse} {...register("warehouse")}>
                            <option value="">Choose a warehouse…</option>
                            {warehouses.map((warehouse) => (
                                <option key={warehouse._id} value={warehouse._id}>
                                    {warehouse.name} ({warehouse.code})
                                </option>
                            ))}
                        </SelectField>
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
                            <div key={field.id} className="grid items-start gap-3 sm:grid-cols-[1fr_8rem_auto]">
                                <SelectField
                                    label={`Product ${index + 1}`}
                                    error={errors.items?.[index]?.product}
                                    {...register(`items.${index}.product`)}
                                >
                                    <option value="">Choose a product…</option>
                                    {products.map((product) => (
                                        <option key={product._id} value={product._id}>
                                            {product.name} ({product.sku}) — {formatCurrency(product.sellingPrice)}
                                        </option>
                                    ))}
                                </SelectField>
                                <TextField
                                    label={`Quantity ${index + 1}`}
                                    type="number"
                                    error={errors.items?.[index]?.quantity}
                                    {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-square mt-0 self-end text-error sm:mb-[1.4rem]"
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
                            Estimate: {formatCurrency(estimate.subtotal)} + {formatCurrency(estimate.tax)} tax ={" "}
                            <strong>{formatCurrency(estimate.subtotal + estimate.tax)}</strong>
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
                {isEdit ? (
                    <button type="button" className="btn btn-primary" disabled={isSubmitting} onClick={handleSubmit((values) => onSave(values, { confirm: false }))}>
                        {isSubmitting ? "Saving…" : "Save changes"}
                    </button>
                ) : (
                    <>
                        <button type="button" className="btn" disabled={isSubmitting} onClick={handleSubmit((values) => onSave(values, { confirm: false }))}>
                            Save as pending
                        </button>
                        <button type="button" className="btn btn-primary" disabled={isSubmitting} onClick={handleSubmit((values) => onSave(values, { confirm: true }))}>
                            {isSubmitting ? "Saving…" : "Save and confirm"}
                        </button>
                    </>
                )}
            </div>
        </form>
    );
};

// The current item lines while the user types (used for the price estimate)
const useWatchedItems = (control) => useWatch({ control, name: "items" }) || [];

export default OrderFormPage;

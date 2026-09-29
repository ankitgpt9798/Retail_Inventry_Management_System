import { useState } from "react";
import { useSelector } from "react-redux";
import { Pencil, Plus, Power, RotateCcw } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import SupplierForm from "../../components/catalog/SupplierForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";

const PAGE_SIZE = 10;

const SuppliersPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("suppliers", role);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "deactivate", supplier }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const { items, pagination, isLoading, error, reload } = useList("/suppliers", "suppliers", {
        search: debouncedSearch,
        status,
        page,
        limit: PAGE_SIZE
    });

    const withPageReset = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

    const closeDialog = () => setDialog(null);

    const handleSaved = (message) => {
        closeDialog();
        setNotice(message);
        reload();
    };

    const handleDeactivate = async () => {
        const response = await api.delete(`/suppliers/${dialog.supplier._id}`);
        // Deactivating a supplier also switches off the logins of its portal users
        const count = response.data?.data?.deactivatedUserCount || 0;
        handleSaved(count > 0 ? `Supplier deactivated. ${count} portal login(s) were deactivated too.` : "Supplier deactivated.");
    };

    const handleReactivate = async (supplier) => {
        setActionError("");
        try {
            await api.put(`/suppliers/${supplier._id}`, { status: "ACTIVE" });
            setNotice("Supplier reactivated.");
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not reactivate the supplier"));
        }
    };

    return (
        <>
            <PageHeader title="Suppliers" description="Companies you buy stock from.">
                {mayEdit && (
                    <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", supplier: null })}>
                        <Plus size={16} aria-hidden="true" /> New supplier
                    </button>
                )}
            </PageHeader>

            {notice && (
                <div role="status" className="alert alert-success alert-soft mb-4">
                    {notice}
                </div>
            )}
            {actionError && (
                <div className="mb-4">
                    <ErrorAlert message={actionError} />
                </div>
            )}

            <div className="card border border-base-300 bg-base-100">
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Search name, email, city…">
                    <FilterSelect label="Status" value={status} onChange={withPageReset(setStatus)}>
                        <option value="">All statuses</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                    </FilterSelect>
                </ListToolbar>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading suppliers…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No suppliers found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Supplier</th>
                                    <th>Contact</th>
                                    <th>City</th>
                                    <th>Status</th>
                                    {mayEdit && <th className="text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((supplier) => (
                                    <tr key={supplier._id}>
                                        <td>
                                            <div className="font-medium">{supplier.name}</div>
                                            <div className="text-xs text-base-content/60">{supplier.email}</div>
                                        </td>
                                        <td>
                                            <div>{supplier.contactPerson || "—"}</div>
                                            {supplier.phone && <div className="text-xs text-base-content/60">{supplier.phone}</div>}
                                        </td>
                                        <td>{supplier.city || "—"}</td>
                                        <td><StatusBadge status={supplier.status} /></td>
                                        {mayEdit && (
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "form", supplier })}
                                                        aria-label={`Edit ${supplier.name}`}
                                                    >
                                                        <Pencil size={14} aria-hidden="true" /> Edit
                                                    </button>
                                                    {supplier.status === "ACTIVE" ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm text-error"
                                                            onClick={() => setDialog({ type: "deactivate", supplier })}
                                                            aria-label={`Deactivate ${supplier.name}`}
                                                        >
                                                            <Power size={14} aria-hidden="true" /> Deactivate
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleReactivate(supplier)}
                                                            aria-label={`Reactivate ${supplier.name}`}
                                                        >
                                                            <RotateCcw size={14} aria-hidden="true" /> Reactivate
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>

            {dialog?.type === "form" && (
                <Modal title={dialog.supplier ? "Edit supplier" : "New supplier"} onClose={closeDialog} wide>
                    <SupplierForm supplier={dialog.supplier} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "deactivate" && (
                <ConfirmModal
                    title="Deactivate supplier?"
                    message={`"${dialog.supplier.name}" can't receive new purchase orders, and its portal logins are switched off. A supplier with open purchase orders can't be deactivated.`}
                    confirmLabel="Deactivate"
                    onConfirm={handleDeactivate}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default SuppliersPage;

import { useEffect, useState } from "react";
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
import WarehouseForm from "../../components/catalog/WarehouseForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import fetchAllPages from "../../services/fetchAllPages";
import { canEdit } from "../../utils/navigation";
import { ROLES } from "../../utils/roles";
import { formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

const WarehousesPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("warehouses", role);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "deactivate", warehouse }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    // Only admins may list users (backend rule), so only they get the manager drop-down.
    // null = "no list available" → the form hides the manager field.
    const [managers, setManagers] = useState(null);
    useEffect(() => {
        if (role !== ROLES.ADMIN) return;
        fetchAllPages("/users", "users", { role: ROLES.INVENTORY_MANAGER, status: "ACTIVE" })
            .then(setManagers)
            .catch(() => setManagers(null));
    }, [role]);

    const { items, pagination, isLoading, error, reload } = useList("/warehouses", "warehouses", {
        search: debouncedSearch,
        status,
        page,
        limit: PAGE_SIZE
    });

    const changeSearch = (value) => {
        setSearch(value);
        setPage(1);
    };
    const changeStatus = (value) => {
        setStatus(value);
        setPage(1);
    };

    const closeDialog = () => setDialog(null);

    const handleSaved = (message) => {
        closeDialog();
        setNotice(message);
        reload();
    };

    const handleDeactivate = async () => {
        await api.delete(`/warehouses/${dialog.warehouse._id}`);
        handleSaved("Warehouse deactivated.");
    };

    const handleReactivate = async (warehouse) => {
        setActionError("");
        try {
            await api.put(`/warehouses/${warehouse._id}`, { status: "ACTIVE" });
            setNotice("Warehouse reactivated.");
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not reactivate the warehouse"));
        }
    };

    return (
        <>
            <PageHeader title="Warehouses" description="Where your stock is kept.">
                {mayEdit && (
                    <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", warehouse: null })}>
                        <Plus size={16} aria-hidden="true" /> New warehouse
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
                <ListToolbar search={search} onSearchChange={changeSearch} placeholder="Search name, code, city…">
                    <FilterSelect label="Status" value={status} onChange={changeStatus}>
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
                    <Loader text="Loading warehouses…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No warehouses found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Warehouse</th>
                                    <th>Code</th>
                                    <th>City</th>
                                    <th>Manager</th>
                                    <th className="text-right">Capacity</th>
                                    <th>Status</th>
                                    {mayEdit && <th className="text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((warehouse) => (
                                    <tr key={warehouse._id}>
                                        <td className="font-medium">{warehouse.name}</td>
                                        <td className="font-mono text-sm">{warehouse.code}</td>
                                        <td>{warehouse.city}</td>
                                        <td>{warehouse.manager?.name || "—"}</td>
                                        <td className="text-right">{formatNumber(warehouse.capacity)}</td>
                                        <td><StatusBadge status={warehouse.status} /></td>
                                        {mayEdit && (
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "form", warehouse })}
                                                        aria-label={`Edit ${warehouse.name}`}
                                                    >
                                                        <Pencil size={14} aria-hidden="true" /> Edit
                                                    </button>
                                                    {warehouse.status === "ACTIVE" ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm text-error"
                                                            onClick={() => setDialog({ type: "deactivate", warehouse })}
                                                            aria-label={`Deactivate ${warehouse.name}`}
                                                        >
                                                            <Power size={14} aria-hidden="true" /> Deactivate
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleReactivate(warehouse)}
                                                            aria-label={`Reactivate ${warehouse.name}`}
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
                <Modal title={dialog.warehouse ? "Edit warehouse" : "New warehouse"} onClose={closeDialog} wide>
                    <WarehouseForm warehouse={dialog.warehouse} managers={managers} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "deactivate" && (
                <ConfirmModal
                    title="Deactivate warehouse?"
                    message={`"${dialog.warehouse.name}" will stop receiving stock. A warehouse that still holds stock or has open transfers can't be deactivated.`}
                    confirmLabel="Deactivate"
                    onConfirm={handleDeactivate}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default WarehousesPage;

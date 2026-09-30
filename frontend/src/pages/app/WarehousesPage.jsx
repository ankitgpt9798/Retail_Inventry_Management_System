import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { ClipboardList, MapPin, Plus, Warehouse } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import RecordActions from "../../components/common/RecordActions";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import WarehouseForm from "../../components/catalog/WarehouseForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import fetchAllPages from "../../services/fetchAllPages";
import { canEdit } from "../../utils/navigation";
import { ROLES } from "../../utils/roles";
import { formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "name", label: "Name A–Z" },
    { value: "name_desc", label: "Name Z–A" },
    { value: "capacity_high", label: "Largest capacity" },
    { value: "capacity_low", label: "Smallest capacity" },
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" }
];

const INITIAL_FILTERS = { search: "", status: "", sort: "name" };

const WarehousesPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("warehouses", role);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

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
        ...filters,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE
    });

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

    const newWarehouseButton = mayEdit && (
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", warehouse: null })}>
            <Plus size={16} aria-hidden="true" /> New warehouse
        </button>
    );

    const renderWarehouse = (warehouse) => (
        <RecordCard
            key={warehouse._id}
            label={warehouse.name}
            title={warehouse.name}
            code={warehouse.code}
            subtitle={[warehouse.city, warehouse.state].filter(Boolean).join(", ")}
            icon={Warehouse}
            status={<StatusBadge status={warehouse.status} />}
            footer={
                <>
                    <Link to={`/inventory?warehouse=${warehouse._id}`} className="btn btn-ghost btn-sm" aria-label={`View stock in ${warehouse.name}`}>
                        <ClipboardList size={14} aria-hidden="true" /> Stock
                    </Link>
                    {mayEdit && (
                        <RecordActions
                            name={warehouse.name}
                            isActive={warehouse.status === "ACTIVE"}
                            onEdit={() => setDialog({ type: "form", warehouse })}
                            onDeactivate={() => setDialog({ type: "deactivate", warehouse })}
                            onReactivate={() => handleReactivate(warehouse)}
                        />
                    )}
                </>
            }
        >
            <CardFields>
                <CardField label="Manager" value={warehouse.manager?.name || "Not assigned"} />
                <CardField label="Capacity" value={`${formatNumber(warehouse.capacity)} units`} strong />
            </CardFields>
            {warehouse.address && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-base-content/60">
                    <MapPin size={14} className="mt-px shrink-0" aria-hidden="true" />
                    {warehouse.address}
                </p>
            )}
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Warehouses" description="Where your stock is kept.">
                {newWarehouseButton}
            </PageHeader>

            <PageAlerts notice={notice} error={actionError} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search name, code, city…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                </FilterSelect>
                <FilterSelect label="Sort by" value={filters.sort} onChange={(value) => setFilter("sort", value)}>
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="warehouses"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={Warehouse}
                emptyMessage="Add a warehouse to start receiving stock."
                renderItem={renderWarehouse}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="warehouses" />

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

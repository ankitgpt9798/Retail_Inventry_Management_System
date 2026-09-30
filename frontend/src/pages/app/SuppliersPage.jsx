import { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { FileText, Mail, Phone, Plus, Truck } from "lucide-react";
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
import SupplierForm from "../../components/catalog/SupplierForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";
import { formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "name", label: "Name A–Z" },
    { value: "name_desc", label: "Name Z–A" },
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" }
];

const INITIAL_FILTERS = { search: "", status: "", sort: "name" };

const SuppliersPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("suppliers", role);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "deactivate", supplier }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const { items, pagination, isLoading, error, reload } = useList("/suppliers", "suppliers", {
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

    const newSupplierButton = mayEdit && (
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", supplier: null })}>
            <Plus size={16} aria-hidden="true" /> New supplier
        </button>
    );

    const renderSupplier = (supplier) => (
        <RecordCard
            key={supplier._id}
            label={supplier.name}
            title={supplier.name}
            subtitle={supplier.city || "City not set"}
            icon={Truck}
            status={<StatusBadge status={supplier.status} />}
            footer={
                <>
                    <Link to={`/purchases?supplier=${supplier._id}`} className="btn btn-ghost btn-sm" aria-label={`View purchase orders of ${supplier.name}`}>
                        <FileText size={14} aria-hidden="true" /> POs
                    </Link>
                    {mayEdit && (
                        <RecordActions
                            name={supplier.name}
                            isActive={supplier.status === "ACTIVE"}
                            onEdit={() => setDialog({ type: "form", supplier })}
                            onDeactivate={() => setDialog({ type: "deactivate", supplier })}
                            onReactivate={() => handleReactivate(supplier)}
                        />
                    )}
                </>
            }
        >
            <CardFields>
                <CardField label="Contact" value={supplier.contactPerson || "—"} wide />
                <CardField label="Products supplied" value={formatNumber(supplier.productCount ?? 0)} strong />
                <CardField label="Purchase orders" value={formatNumber(supplier.purchaseCount ?? 0)} strong />
            </CardFields>
            <div className="mt-3 space-y-1 text-xs text-base-content/65">
                <p className="flex min-w-0 items-center gap-1.5">
                    <Mail size={14} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{supplier.email}</span>
                </p>
                {supplier.phone && (
                    <p className="flex items-center gap-1.5">
                        <Phone size={14} className="shrink-0" aria-hidden="true" />
                        {supplier.phone}
                    </p>
                )}
            </div>
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Suppliers" description="Companies you buy stock from.">
                {newSupplierButton}
            </PageHeader>

            <PageAlerts notice={notice} error={actionError} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search name, contact, email, phone…"
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
                noun="suppliers"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={Truck}
                emptyMessage="Add the companies you buy from to raise purchase orders."
                renderItem={renderSupplier}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="suppliers" />

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

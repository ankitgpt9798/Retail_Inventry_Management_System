import { useState } from "react";
import { useSelector } from "react-redux";
import { ArrowLeftRight, ArrowRight, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ReasonModal from "../../components/common/ReasonModal";
import TransferForm from "../../components/inventory/TransferForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { formatDateTime, formatNumber } from "../../utils/format";
import { TRANSFER_STATUS_STYLES } from "../../utils/statusStyles";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "quantity_high", label: "Quantity: high to low" },
    { value: "quantity_low", label: "Quantity: low to high" }
];

const INITIAL_FILTERS = { search: "", status: "", warehouse: "", sort: "newest" };

// The next steps a transfer allows, by status (same flow as the backend):
//   REQUESTED → approve / reject / cancel → APPROVED → dispatch / cancel → DISPATCHED → receive
const ACTIONS_BY_STATUS = {
    REQUESTED: ["approve", "reject", "cancel"],
    APPROVED: ["dispatch", "cancel"],
    DISPATCHED: ["receive"]
};

const TransfersPage = () => {
    const currentUser = useSelector((state) => state.auth.user);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    // { type: "new" } or { type: "dispatch" | "receive" | "reject" | "cancel", transfer }
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const products = useOptions("/products", "products", { status: "ACTIVE" });
    const warehouses = useOptions("/warehouses", "warehouses", { status: "ACTIVE" });

    const allWarehouses = useOptions("/warehouses", "warehouses");

    const { items, pagination, isLoading, error, reload } = useList("/transfers", "transfers", {
        ...filters,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE
    });

    const closeDialog = () => setDialog(null);

    const handleDone = (message) => {
        closeDialog();
        setNotice(message);
        reload();
    };

    // Runs one step of the flow, e.g. PUT /transfers/:id/approve
    const runAction = async (transfer, action, body) => {
        await api.put(`/transfers/${transfer._id}/${action}`, body);
    };

    // Approve has no pop-up: do it straight away and show any refusal above the table
    const handleApprove = async (transfer) => {
        setActionError("");
        setNotice("");
        try {
            await runAction(transfer, "approve");
            setNotice(`${transfer.transferNumber} approved.`);
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not approve the transfer"));
        }
    };

    const renderActions = (transfer) => {
        const actions = ACTIONS_BY_STATUS[transfer.status] || [];
        // The backend refuses self-approval, so don't offer the button
        const isOwnRequest = transfer.requestedBy?._id === currentUser._id;

        if (actions.length === 0) return null; // finished: received, rejected or cancelled

        return (
            <>
                {actions.includes("approve") &&
                    (isOwnRequest ? (
                        <span className="mr-auto self-center text-xs text-base-content/60">Needs another approver</span>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleApprove(transfer)}
                            aria-label={`Approve ${transfer.transferNumber}`}
                        >
                            Approve
                        </button>
                    ))}
                {actions.includes("reject") && !isOwnRequest && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm text-error"
                        onClick={() => setDialog({ type: "reject", transfer })}
                        aria-label={`Reject ${transfer.transferNumber}`}
                    >
                        Reject
                    </button>
                )}
                {actions.includes("dispatch") && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDialog({ type: "dispatch", transfer })}
                        aria-label={`Dispatch ${transfer.transferNumber}`}
                    >
                        Dispatch
                    </button>
                )}
                {actions.includes("receive") && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDialog({ type: "receive", transfer })}
                        aria-label={`Receive ${transfer.transferNumber}`}
                    >
                        Receive
                    </button>
                )}
                {actions.includes("cancel") && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm text-error"
                        onClick={() => setDialog({ type: "cancel", transfer })}
                        aria-label={`Cancel ${transfer.transferNumber}`}
                    >
                        Cancel
                    </button>
                )}
            </>
        );
    };

    const renderTransfer = (transfer) => (
        <RecordCard
            key={transfer._id}
            label={transfer.transferNumber}
            title={transfer.product?.name}
            code={transfer.transferNumber}
            subtitle={transfer.product?.sku}
            icon={ArrowLeftRight}
            status={<StatusBadge status={transfer.status} styles={TRANSFER_STATUS_STYLES} />}
            footer={renderActions(transfer)}
        >
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-base-200/70 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium" title={transfer.fromWarehouse?.name}>{transfer.fromWarehouse?.code}</span>
                <ArrowRight size={14} className="shrink-0 text-base-content/50" aria-label="to" />
                <span className="min-w-0 truncate font-medium" title={transfer.toWarehouse?.name}>{transfer.toWarehouse?.code}</span>
                <span className="ml-auto shrink-0 font-semibold tabular-nums">{formatNumber(transfer.quantity)} units</span>
            </div>
            <CardFields>
                <CardField label="Requested by" value={transfer.requestedBy?.name || "—"} />
                <CardField label="Requested on" value={formatDateTime(transfer.createdAt)} />
                {transfer.notes && <CardField label="Notes" value={transfer.notes} wide />}
                {transfer.rejectionReason && <CardField label="Rejection reason" value={transfer.rejectionReason} wide tone="error" />}
                {transfer.cancelReason && <CardField label="Cancel reason" value={transfer.cancelReason} wide />}
            </CardFields>
        </RecordCard>
    );

    return (
        <>
            <PageHeader title="Transfers" description="Move stock from one warehouse to another.">
                <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "new" })}>
                    <Plus size={16} aria-hidden="true" /> New transfer
                </button>
            </PageHeader>

            <PageAlerts notice={notice} error={actionError} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search transfer number or product…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    {Object.entries(TRANSFER_STATUS_STYLES).map(([value, style]) => (
                        <option key={value} value={value}>
                            {style.label}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Warehouse" value={filters.warehouse} onChange={(value) => setFilter("warehouse", value)}>
                    <option value="">All warehouses</option>
                    {allWarehouses.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.name}
                        </option>
                    ))}
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
                noun="transfers"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={ArrowLeftRight}
                emptyMessage="Move stock between warehouses with a transfer request."
                renderItem={renderTransfer}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="transfers" />

            {dialog?.type === "new" && (
                <Modal title="New transfer" onClose={closeDialog}>
                    <TransferForm products={products} warehouses={warehouses} onSaved={handleDone} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "dispatch" && (
                <ConfirmModal
                    title="Dispatch transfer?"
                    message={`${formatNumber(dialog.transfer.quantity)} unit(s) of ${dialog.transfer.product?.name} will be taken out of ${dialog.transfer.fromWarehouse?.name} now.`}
                    confirmLabel="Dispatch"
                    confirmClass="btn-primary"
                    onConfirm={async () => {
                        await runAction(dialog.transfer, "dispatch");
                        handleDone(`${dialog.transfer.transferNumber} dispatched.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog?.type === "receive" && (
                <ConfirmModal
                    title="Receive transfer?"
                    message={`${formatNumber(dialog.transfer.quantity)} unit(s) of ${dialog.transfer.product?.name} will be added to ${dialog.transfer.toWarehouse?.name}.`}
                    confirmLabel="Receive"
                    confirmClass="btn-primary"
                    onConfirm={async () => {
                        await runAction(dialog.transfer, "receive");
                        handleDone(`${dialog.transfer.transferNumber} received.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog?.type === "reject" && (
                <ReasonModal
                    title={`Reject ${dialog.transfer.transferNumber}?`}
                    label="Reason for rejecting"
                    required
                    confirmLabel="Reject transfer"
                    onSubmit={async (reason) => {
                        await runAction(dialog.transfer, "reject", { reason });
                        handleDone(`${dialog.transfer.transferNumber} rejected.`);
                    }}
                    onClose={closeDialog}
                />
            )}
            {dialog?.type === "cancel" && (
                <ReasonModal
                    title={`Cancel ${dialog.transfer.transferNumber}?`}
                    label="Reason (optional)"
                    confirmLabel="Cancel transfer"
                    onSubmit={async (reason) => {
                        await runAction(dialog.transfer, "cancel", reason ? { reason } : {});
                        handleDone(`${dialog.transfer.transferNumber} cancelled.`);
                    }}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default TransfersPage;

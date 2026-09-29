import { useState } from "react";
import { useSelector } from "react-redux";
import { ArrowRight, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ReasonModal from "../../components/common/ReasonModal";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import TransferForm from "../../components/inventory/TransferForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { formatDateTime, formatNumber } from "../../utils/format";

const PAGE_SIZE = 10;

const STATUS_STYLES = {
    REQUESTED: { label: "Requested", className: "badge-info" },
    APPROVED: { label: "Approved", className: "badge-primary" },
    REJECTED: { label: "Rejected", className: "badge-error" },
    DISPATCHED: { label: "Dispatched", className: "badge-warning" },
    RECEIVED: { label: "Received", className: "badge-success" },
    CANCELLED: { label: "Cancelled", className: "badge-neutral" }
};

// The next steps a transfer allows, by status (same flow as the backend):
//   REQUESTED → approve / reject / cancel → APPROVED → dispatch / cancel → DISPATCHED → receive
const ACTIONS_BY_STATUS = {
    REQUESTED: ["approve", "reject", "cancel"],
    APPROVED: ["dispatch", "cancel"],
    DISPATCHED: ["receive"]
};

const TransfersPage = () => {
    const currentUser = useSelector((state) => state.auth.user);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    // { type: "new" } or { type: "dispatch" | "receive" | "reject" | "cancel", transfer }
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const products = useOptions("/products", "products", { status: "ACTIVE" });
    const warehouses = useOptions("/warehouses", "warehouses", { status: "ACTIVE" });

    const { items, pagination, isLoading, error, reload } = useList("/transfers", "transfers", {
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

        return (
            <div className="flex flex-wrap justify-end gap-1">
                {actions.includes("approve") &&
                    (isOwnRequest ? (
                        <span className="self-center text-xs text-base-content/60">Needs another approver</span>
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
            </div>
        );
    };

    return (
        <>
            <PageHeader title="Transfers" description="Move stock from one warehouse to another.">
                <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "new" })}>
                    <Plus size={16} aria-hidden="true" /> New transfer
                </button>
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
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Search transfer number…">
                    <FilterSelect label="Status" value={status} onChange={withPageReset(setStatus)}>
                        <option value="">All statuses</option>
                        {Object.entries(STATUS_STYLES).map(([value, style]) => (
                            <option key={value} value={value}>
                                {style.label}
                            </option>
                        ))}
                    </FilterSelect>
                </ListToolbar>

                {error ? (
                    <div className="p-4">
                        <ErrorAlert message={error} onRetry={reload} />
                    </div>
                ) : isLoading ? (
                    <Loader text="Loading transfers…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No transfers found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Transfer</th>
                                    <th>Product</th>
                                    <th>Route</th>
                                    <th className="text-right">Qty</th>
                                    <th>Status</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((transfer) => {
                                    const style = STATUS_STYLES[transfer.status] || { label: transfer.status, className: "badge-neutral" };
                                    return (
                                        <tr key={transfer._id}>
                                            <td>
                                                <div className="font-mono text-sm font-medium">{transfer.transferNumber}</div>
                                                <div className="text-xs text-base-content/60">
                                                    {transfer.requestedBy?.name} · {formatDateTime(transfer.createdAt)}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="font-medium">{transfer.product?.name}</div>
                                                <div className="font-mono text-xs text-base-content/60">{transfer.product?.sku}</div>
                                            </td>
                                            <td className="whitespace-nowrap">
                                                {transfer.fromWarehouse?.code}
                                                <ArrowRight size={14} className="mx-1 inline" aria-label="to" />
                                                {transfer.toWarehouse?.code}
                                            </td>
                                            <td className="text-right">{formatNumber(transfer.quantity)}</td>
                                            <td>
                                                <span className={`badge badge-sm badge-soft ${style.className}`}>{style.label}</span>
                                                {transfer.rejectionReason && (
                                                    <div className="mt-1 text-xs text-base-content/60">{transfer.rejectionReason}</div>
                                                )}
                                            </td>
                                            <td>{renderActions(transfer)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>

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

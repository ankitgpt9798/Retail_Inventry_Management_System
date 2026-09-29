import { useState } from "react";
import { useSelector } from "react-redux";
import { KeyRound, Pencil, Plus, Power, RotateCcw, UserCheck } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import Pagination from "../../components/common/Pagination";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ErrorAlert from "../../components/common/ErrorAlert";
import Loader from "../../components/common/Loader";
import UserForm from "../../components/users/UserForm";
import ResetPasswordForm from "../../components/users/ResetPasswordForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { formatDateTime } from "../../utils/format";
import { formatRole, ROLES } from "../../utils/roles";

const PAGE_SIZE = 10;

const STATUS_STYLES = {
    ACTIVE: { label: "Active", className: "badge-success" },
    PENDING: { label: "Pending approval", className: "badge-warning" },
    INACTIVE: { label: "Inactive", className: "badge-neutral" }
};

// User management (admin only): approve sign-ups, create accounts, change roles, reset passwords, deactivate.
const UsersPage = () => {
    const currentUser = useSelector((state) => state.auth.user);

    const [search, setSearch] = useState("");
    const [role, setRole] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "password" | "deactivate", user }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const suppliers = useOptions("/suppliers", "suppliers", { status: "ACTIVE" });

    const { items, pagination, isLoading, error, reload } = useList("/users", "users", {
        search: debouncedSearch,
        role,
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
        await api.delete(`/users/${dialog.user._id}`);
        handleSaved(`${dialog.user.name} was deactivated.`);
    };

    // Approving a sign-up and reactivating an account are the same thing: status ACTIVE
    const activate = async (user, message) => {
        setActionError("");
        try {
            await api.put(`/users/${user._id}`, { status: "ACTIVE" });
            setNotice(message);
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not update the user"));
        }
    };

    return (
        <>
            <PageHeader title="Users" description="Who can sign in, and what they can do.">
                <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", user: null })}>
                    <Plus size={16} aria-hidden="true" /> New user
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
                <ListToolbar search={search} onSearchChange={withPageReset(setSearch)} placeholder="Search name or email…">
                    <FilterSelect label="Role" value={role} onChange={withPageReset(setRole)}>
                        <option value="">All roles</option>
                        {Object.values(ROLES).map((value) => (
                            <option key={value} value={value}>
                                {formatRole(value)}
                            </option>
                        ))}
                    </FilterSelect>
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
                    <Loader text="Loading users…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No users found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Last login</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((user) => {
                                    const style = STATUS_STYLES[user.status] || { label: user.status, className: "badge-neutral" };
                                    const isSelf = user._id === currentUser._id;
                                    return (
                                        <tr key={user._id}>
                                            <td>
                                                <div className="font-medium">
                                                    {user.name}
                                                    {isSelf && <span className="ml-2 text-xs text-base-content/60">(you)</span>}
                                                </div>
                                                <div className="text-xs text-base-content/60">{user.email}</div>
                                            </td>
                                            <td>
                                                <div>{formatRole(user.role)}</div>
                                                {user.supplier?.name && <div className="text-xs text-base-content/60">{user.supplier.name}</div>}
                                            </td>
                                            <td><span className={`badge badge-sm badge-soft ${style.className}`}>{style.label}</span></td>
                                            <td className="text-sm">{formatDateTime(user.lastLoginAt)}</td>
                                            <td>
                                                <div className="flex flex-wrap justify-end gap-1">
                                                    {user.status === "PENDING" && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => activate(user, `${user.name} was approved and can now sign in.`)}
                                                            aria-label={`Approve ${user.name}`}
                                                        >
                                                            <UserCheck size={14} aria-hidden="true" /> Approve
                                                        </button>
                                                    )}
                                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ type: "form", user })} aria-label={`Edit ${user.name}`}>
                                                        <Pencil size={14} aria-hidden="true" /> Edit
                                                    </button>
                                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ type: "password", user })} aria-label={`Reset password for ${user.name}`}>
                                                        <KeyRound size={14} aria-hidden="true" />
                                                    </button>
                                                    {user.status === "INACTIVE" ? (
                                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => activate(user, `${user.name} was reactivated.`)} aria-label={`Reactivate ${user.name}`}>
                                                            <RotateCcw size={14} aria-hidden="true" /> Reactivate
                                                        </button>
                                                    ) : (
                                                        !isSelf && (
                                                            <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => setDialog({ type: "deactivate", user })} aria-label={`Deactivate ${user.name}`}>
                                                                <Power size={14} aria-hidden="true" /> Deactivate
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination pagination={pagination} onPageChange={setPage} />
            </div>

            {dialog?.type === "form" && (
                <Modal title={dialog.user ? "Edit user" : "New user"} onClose={closeDialog} wide>
                    <UserForm user={dialog.user} suppliers={suppliers} isSelf={dialog.user?._id === currentUser._id} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "password" && (
                <Modal title="Reset password" onClose={closeDialog}>
                    <ResetPasswordForm user={dialog.user} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "deactivate" && (
                <ConfirmModal
                    title="Deactivate user?"
                    message={`${dialog.user.name} will no longer be able to sign in. You can reactivate the account later.`}
                    confirmLabel="Deactivate"
                    onConfirm={handleDeactivate}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default UsersPage;

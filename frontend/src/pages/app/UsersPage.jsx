import { useState } from "react";
import { useSelector } from "react-redux";
import { KeyRound, Pencil, Plus, Power, RotateCcw, UserCheck, UserRound } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import PageAlerts from "../../components/common/PageAlerts";
import ListToolbar, { FilterSelect } from "../../components/common/ListToolbar";
import RecordList from "../../components/common/RecordList";
import RecordCard, { CardField, CardFields } from "../../components/common/RecordCard";
import Pagination from "../../components/common/Pagination";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import ConfirmModal from "../../components/common/ConfirmModal";
import UserForm from "../../components/users/UserForm";
import ResetPasswordForm from "../../components/users/ResetPasswordForm";
import useDebounce from "../../hooks/useDebounce";
import useFilters from "../../hooks/useFilters";
import useList from "../../hooks/useList";
import useOptions from "../../hooks/useOptions";
import api, { getErrorMessage } from "../../services/api";
import { formatDateTime } from "../../utils/format";
import { formatRole, ROLES } from "../../utils/roles";
import { USER_STATUS_STYLES } from "../../utils/statusStyles";

const PAGE_SIZE = 10;

const INITIAL_FILTERS = { search: "", role: "", status: "" };

// User management (admin only): approve sign-ups, create accounts, change roles, reset passwords, deactivate.
const UsersPage = () => {
    const currentUser = useSelector((state) => state.auth.user);

    const { filters, setFilter, clearFilters, hasFilters, page, setPage } = useFilters(INITIAL_FILTERS);
    const debouncedSearch = useDebounce(filters.search);

    const [dialog, setDialog] = useState(null); // { type: "form" | "password" | "deactivate", user }
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const suppliers = useOptions("/suppliers", "suppliers", { status: "ACTIVE" });

    const { items, pagination, isLoading, error, reload } = useList("/users", "users", {
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

    const renderUser = (user) => {
        const isSelf = user._id === currentUser._id;
        return (
            <RecordCard
                key={user._id}
                label={user.name}
                title={isSelf ? `${user.name} (you)` : user.name}
                subtitle={user.email}
                icon={UserRound}
                accent={user.status === "PENDING" ? "warning" : undefined}
                status={<StatusBadge status={user.status} styles={USER_STATUS_STYLES} />}
                footer={
                    <>
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
                            <KeyRound size={14} aria-hidden="true" /> Password
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
                    </>
                }
            >
                <CardFields>
                    <CardField label="Role" value={formatRole(user.role)} />
                    <CardField label="Last login" value={formatDateTime(user.lastLoginAt)} />
                    {user.supplier?.name && <CardField label="Supplier company" value={user.supplier.name} wide />}
                    {user.phone && <CardField label="Phone" value={user.phone} />}
                </CardFields>
            </RecordCard>
        );
    };

    return (
        <>
            <PageHeader title="Users" description="Who can sign in, and what they can do.">
                <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", user: null })}>
                    <Plus size={16} aria-hidden="true" /> New user
                </button>
            </PageHeader>

            <PageAlerts notice={notice} error={actionError} onDismissNotice={() => setNotice("")} />

            <ListToolbar
                search={filters.search}
                onSearchChange={(value) => setFilter("search", value)}
                placeholder="Search name or email…"
                hasFilters={hasFilters}
                onClear={clearFilters}
            >
                <FilterSelect label="Role" value={filters.role} onChange={(value) => setFilter("role", value)}>
                    <option value="">All roles</option>
                    {Object.values(ROLES).map((value) => (
                        <option key={value} value={value}>
                            {formatRole(value)}
                        </option>
                    ))}
                </FilterSelect>
                <FilterSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)}>
                    <option value="">All statuses</option>
                    {Object.entries(USER_STATUS_STYLES).map(([value, style]) => (
                        <option key={value} value={value}>
                            {style.label}
                        </option>
                    ))}
                </FilterSelect>
            </ListToolbar>

            <RecordList
                items={items}
                isLoading={isLoading}
                error={error}
                onRetry={reload}
                noun="users"
                isFiltered={hasFilters}
                onClearFilters={clearFilters}
                emptyIcon={UserRound}
                renderItem={renderUser}
            />

            <Pagination pagination={pagination} onPageChange={setPage} noun="users" />

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

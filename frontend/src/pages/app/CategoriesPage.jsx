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
import CategoryForm from "../../components/catalog/CategoryForm";
import useDebounce from "../../hooks/useDebounce";
import useList from "../../hooks/useList";
import api, { getErrorMessage } from "../../services/api";
import { canEdit } from "../../utils/navigation";

const PAGE_SIZE = 10;

const CategoriesPage = () => {
    const role = useSelector((state) => state.auth.user.role);
    const mayEdit = canEdit("categories", role);

    // Filters. Typing in the search box waits 400 ms before calling the API.
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search);

    // Which pop-up is open: { type: "form" | "deactivate", category } or null
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState("");
    const [actionError, setActionError] = useState("");

    const { items, pagination, isLoading, error, reload } = useList("/categories", "categories", {
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
        await api.delete(`/categories/${dialog.category._id}`);
        handleSaved("Category deactivated.");
    };

    const handleReactivate = async (category) => {
        setActionError("");
        try {
            await api.put(`/categories/${category._id}`, { status: "ACTIVE" });
            setNotice("Category reactivated.");
            reload();
        }
        catch (err) {
            setActionError(getErrorMessage(err, "Could not reactivate the category"));
        }
    };

    return (
        <>
            <PageHeader title="Categories" description="Groups that products belong to.">
                {mayEdit && (
                    <button type="button" className="btn btn-primary" onClick={() => setDialog({ type: "form", category: null })}>
                        <Plus size={16} aria-hidden="true" /> New category
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
                <ListToolbar search={search} onSearchChange={changeSearch} placeholder="Search categories…">
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
                    <Loader text="Loading categories…" />
                ) : items.length === 0 ? (
                    <p className="p-10 text-center text-base-content/70">No categories found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    {mayEdit && <th className="text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((category) => (
                                    <tr key={category._id}>
                                        <td className="font-medium">{category.name}</td>
                                        <td className="text-base-content/70">{category.description || "—"}</td>
                                        <td><StatusBadge status={category.status} /></td>
                                        {mayEdit && (
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setDialog({ type: "form", category })}
                                                        aria-label={`Edit ${category.name}`}
                                                    >
                                                        <Pencil size={14} aria-hidden="true" /> Edit
                                                    </button>
                                                    {category.status === "ACTIVE" ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm text-error"
                                                            onClick={() => setDialog({ type: "deactivate", category })}
                                                            aria-label={`Deactivate ${category.name}`}
                                                        >
                                                            <Power size={14} aria-hidden="true" /> Deactivate
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleReactivate(category)}
                                                            aria-label={`Reactivate ${category.name}`}
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
                <Modal title={dialog.category ? "Edit category" : "New category"} onClose={closeDialog}>
                    <CategoryForm category={dialog.category} onSaved={handleSaved} onClose={closeDialog} />
                </Modal>
            )}
            {dialog?.type === "deactivate" && (
                <ConfirmModal
                    title="Deactivate category?"
                    message={`"${dialog.category.name}" will be hidden from new products. You can reactivate it later.`}
                    confirmLabel="Deactivate"
                    onConfirm={handleDeactivate}
                    onClose={closeDialog}
                />
            )}
        </>
    );
};

export default CategoriesPage;

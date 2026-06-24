import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    DatabaseBackup,
    Download,
    HardDrive,
    Loader2,
    Plus,
    RotateCcw,
    ShieldCheck,
    Trash2,
    XCircle,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";

const API_BASE = "http://localhost:5000";
const TEST_RESTORE_DATABASE = "retailpulse_restore";

export default function DatabaseBackupPage() {
    const navigate = useNavigate();
    const [user] = useState(() => JSON.parse(sessionStorage.getItem("user")));
    const [backups, setBackups] = useState([]);
    const [storageUsed, setStorageUsed] = useState(0);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [deletingBackup, setDeletingBackup] = useState("");
    const [selectedBackup, setSelectedBackup] = useState("");
    const [verifiedBackup, setVerifiedBackup] = useState("");
    const [alert, setAlert] = useState(null);

    const latestBackup = backups[0];
    const backupStatus = backups.length > 0 ? "Ready" : "No backups";

    const summaryCards = useMemo(
        () => [
            {
                label: "Total Backups",
                value: backups.length,
                note: `${formatFileSize(storageUsed)} stored`,
                icon: DatabaseBackup,
            },
            {
                label: "Latest Backup Date",
                value: latestBackup ? formatDateTime(latestBackup.created_at) : "-",
                note: latestBackup?.filename || "No backup files created",
                icon: Clock,
            },
            {
                label: "Backup Status",
                value: backupStatus,
                note: creating ? "Backup creation in progress" : "PostgreSQL SQL export",
                icon: backupStatus === "Ready" ? CheckCircle2 : AlertTriangle,
            },
        ],
        [backups.length, backupStatus, creating, latestBackup, storageUsed]
    );

    const loadBackups = useCallback(async () => {
        if (!user) return;

        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/admin/backups?user_id=${user.user_id}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Failed to load backups.");
            }
            setBackups(Array.isArray(data.backups) ? data.backups : []);
            setStorageUsed(data.storage_used || 0);
            setSelectedBackup((current) => current || data.backups?.[0]?.filename || "");
        } catch (error) {
            setAlert({ type: "error", message: error.message });
            setBackups([]);
            setStorageUsed(0);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!user || user.role !== "SYSTEM_ADMIN") {
            navigate("/");
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBackups();
    }, [loadBackups, navigate, user]);

    const createBackup = async () => {
        try {
            setCreating(true);
            setAlert(null);
            const res = await fetch(`${API_BASE}/admin/backups/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.user_id }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Backup creation failed.");
            }
            const duration = data.backup?.duration_seconds
                ? ` Duration: ${data.backup.duration_seconds}s.`
                : "";
            setAlert({ type: "success", message: `${data.message}.${duration}` });
            await loadBackups();
        } catch (error) {
            setAlert({ type: "error", message: error.message });
        } finally {
            setCreating(false);
        }
    };

    const verifyBackup = async () => {
        if (!selectedBackup) {
            setAlert({ type: "error", message: "Select a backup file before verification." });
            return;
        }

        try {
            setVerifying(true);
            setVerifiedBackup("");
            setAlert(null);
            const res = await fetch(`${API_BASE}/admin/backups/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.user_id, filename: selectedBackup }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Backup verification failed.");
            }
            setVerifiedBackup(selectedBackup);
            setAlert({ type: "success", message: `${data.message}: ${selectedBackup}` });
        } catch (error) {
            setAlert({ type: "error", message: error.message });
        } finally {
            setVerifying(false);
        }
    };

    const restoreBackup = async (restoreMode = "current_database") => {
        if (!selectedBackup || verifiedBackup !== selectedBackup) {
            setAlert({ type: "error", message: "Verify the selected backup before restoring." });
            return;
        }

        const isSeparateRestore = restoreMode === "separate_database";
        const confirmed = window.confirm(
            isSeparateRestore
                ? `Restore ${selectedBackup} into ${TEST_RESTORE_DATABASE}? Your current database will not be changed.`
                : `Restore database from ${selectedBackup}? Current data will be replaced. A safety backup will be created first.`
        );
        if (!confirmed) return;

        try {
            setRestoring(true);
            setAlert(null);
            const res = await fetch(`${API_BASE}/admin/backups/restore`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user.user_id,
                    filename: selectedBackup,
                    confirm: "RESTORE",
                    restore_mode: restoreMode,
                    ...(isSeparateRestore ? { target_database: TEST_RESTORE_DATABASE } : {}),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Database restore failed.");
            }
            const duration = data.duration_seconds ? ` Duration: ${data.duration_seconds}s.` : "";
            const restoreTarget = data.target_database
                ? ` Target database: ${data.target_database}.`
                : "";
            const safetyBackup = data.safety_backup
                ? ` Safety backup: ${data.safety_backup}.`
                : "";
            setAlert({
                type: "success",
                message: `${data.message}.${duration}${restoreTarget}${safetyBackup}`,
            });
            setVerifiedBackup("");
            await loadBackups();
        } catch (error) {
            setAlert({ type: "error", message: error.message });
        } finally {
            setRestoring(false);
        }
    };

    const downloadBackup = async (filename) => {
        try {
            const res = await fetch(
                `${API_BASE}/admin/backups/download/${encodeURIComponent(filename)}?user_id=${user.user_id}`
            );
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Download failed.");
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setAlert({ type: "error", message: error.message });
        }
    };

    const deleteBackup = async (filename) => {
        if (backups.length <= 1) {
            setAlert({ type: "error", message: "Keep at least one backup available." });
            return;
        }

        const confirmed = window.confirm(`Delete backup file ${filename}? This cannot be undone.`);
        if (!confirmed) return;

        try {
            setDeletingBackup(filename);
            setAlert(null);
            const res = await fetch(
                `${API_BASE}/admin/backups/${encodeURIComponent(filename)}?user_id=${user.user_id}`,
                { method: "DELETE" }
            );
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Delete failed.");
            }

            if (selectedBackup === filename) {
                setSelectedBackup("");
                setVerifiedBackup("");
            }
            setAlert({ type: "success", message: `${data.message}: ${filename}` });
            await loadBackups();
        } catch (error) {
            setAlert({ type: "error", message: error.message });
        } finally {
            setDeletingBackup("");
        }
    };

    return (
        <DashboardLayout
            user={user}
            title="Database Backup & Recovery"
            subtitle="Manage database backup files and support recovery operations."
            onRefresh={loadBackups}
            headerActions={
                <button
                    onClick={createBackup}
                    disabled={creating || !user}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d2d6c] px-4 text-sm font-bold text-white shadow transition hover:bg-[#123a85] disabled:cursor-not-allowed disabled:bg-[#8ea4c4]"
                >
                    {creating ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
                    Create Backup
                </button>
            }
        >
            <div className="space-y-6">
                {alert && <Alert type={alert.type} message={alert.message} />}

                <section className="grid gap-4 md:grid-cols-3">
                    {summaryCards.map((card) => (
                        <SummaryCard key={card.label} {...card} />
                    ))}
                </section>

                <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-5 flex flex-wrap items-center gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7]">
                                <DatabaseBackup size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-extrabold text-[#07102f]">Backup History</h2>
                                <p className="text-sm font-semibold text-[#6f85a3]">
                                    PostgreSQL `.sql` files generated from RetailPulse.
                                </p>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-blue-50">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[820px] text-left text-sm">
                                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                        <tr>
                                            <th className="px-4 py-3">Backup ID</th>
                                            <th className="px-4 py-3">File Name</th>
                                            <th className="px-4 py-3">Created Date</th>
                                            <th className="px-4 py-3">File Size</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {backups.map((backup) => (
                                            <tr key={backup.filename} className="border-t bg-white">
                                                <td className="px-4 py-4 font-bold text-[#1e4db7]">
                                                    #{backup.backup_id}
                                                </td>
                                                <td className="px-4 py-4 font-semibold text-[#17325c]">
                                                    <span className="block max-w-[280px] truncate" title={backup.filename}>
                                                        {backup.filename}
                                                    </span>
                                                    {backup.duration_seconds && (
                                                        <span className="mt-1 block text-xs font-semibold text-[#6f85a3]">
                                                            Duration: {backup.duration_seconds}s
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4">{formatDateTime(backup.created_at)}</td>
                                                <td className="px-4 py-4 font-semibold">
                                                    {formatFileSize(backup.file_size)}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                                        <CheckCircle2 size={14} />
                                                        {backup.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => downloadBackup(backup.filename)}
                                                            className="inline-flex items-center gap-2 rounded-xl bg-[#eef6fb] px-3 py-2 text-sm font-bold text-[#1e4db7] transition hover:bg-[#d9edf8]"
                                                        >
                                                            <Download size={16} />
                                                            Download
                                                        </button>
                                                        <button
                                                            onClick={() => deleteBackup(backup.filename)}
                                                            disabled={backups.length <= 1 || deletingBackup === backup.filename}
                                                            className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                                        >
                                                            {deletingBackup === backup.filename ? (
                                                                <Loader2 size={16} className="animate-spin" />
                                                            ) : (
                                                                <Trash2 size={16} />
                                                            )}
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}

                                        {!loading && backups.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                                    No backup files found.
                                                </td>
                                            </tr>
                                        )}

                                        {loading && (
                                            <tr>
                                                <td colSpan="6" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                                    Loading backup history...
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <aside className="space-y-6">
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7]">
                                    <HardDrive size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-extrabold text-[#07102f]">Storage Used</h2>
                                    <p className="text-sm font-semibold text-[#6f85a3]">
                                        Backup file storage
                                    </p>
                                </div>
                            </div>
                            <p className="text-3xl font-extrabold text-[#0d2d6c]">
                                {formatFileSize(storageUsed)}
                            </p>
                        </section>

                        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-6">
                            <div className="mb-3 flex items-center gap-3 text-amber-800">
                                <AlertTriangle size={22} />
                                <h2 className="text-lg font-extrabold">Recovery Information</h2>
                            </div>
                            <p className="text-sm font-bold leading-6 text-amber-900">
                                Database recovery should only be performed by authorized administrators.
                            </p>
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7]">
                                    <RotateCcw size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-extrabold text-[#07102f]">Restore Database</h2>
                                    <p className="text-sm font-semibold text-[#6f85a3]">
                                        Verify a backup before recovery.
                                    </p>
                                </div>
                            </div>

                            <label className="mb-2 block text-xs font-extrabold uppercase text-[#6f85a3]">
                                Backup File
                            </label>
                            <select
                                value={selectedBackup}
                                onChange={(event) => {
                                    setSelectedBackup(event.target.value);
                                    setVerifiedBackup("");
                                }}
                                disabled={loading || restoring || backups.length === 0}
                                className="mb-4 h-11 w-full rounded-xl border border-blue-100 bg-[#f8fcff] px-3 text-sm font-bold text-[#17325c] outline-none transition focus:border-[#1e4db7] disabled:cursor-not-allowed disabled:bg-slate-100"
                            >
                                {backups.length === 0 && <option value="">No backups available</option>}
                                {backups.map((backup) => (
                                    <option key={backup.filename} value={backup.filename}>
                                        {backup.filename}
                                    </option>
                                ))}
                            </select>

                            <div className="grid gap-3">
                                <button
                                    onClick={verifyBackup}
                                    disabled={!selectedBackup || verifying || restoring}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#eef6fb] px-4 text-sm font-extrabold text-[#1e4db7] transition hover:bg-[#d9edf8] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                    {verifying ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                                    Verify Backup
                                </button>

                                <button
                                    onClick={() => restoreBackup("separate_database")}
                                    disabled={!selectedBackup || verifiedBackup !== selectedBackup || restoring || verifying}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
                                >
                                    {restoring ? <Loader2 size={17} className="animate-spin" /> : <DatabaseBackup size={17} />}
                                    Restore to Test Database
                                </button>

                                <button
                                    onClick={() => restoreBackup("current_database")}
                                    disabled={!selectedBackup || verifiedBackup !== selectedBackup || restoring || verifying}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
                                >
                                    {restoring ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />}
                                    Restore Verified Backup
                                </button>
                            </div>

                            {verifiedBackup === selectedBackup && (
                                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700">
                                    <ShieldCheck size={14} />
                                    Backup verified and ready to restore
                                </div>
                            )}

                            <p className="mt-4 rounded-xl bg-red-50 px-3 py-3 text-xs font-bold leading-5 text-red-700">
                                Test restore creates or replaces {TEST_RESTORE_DATABASE}. Live restore replaces current database data and creates a pre-restore safety backup.
                            </p>
                        </section>
                    </aside>
                </section>
            </div>
        </DashboardLayout>
    );
}

function SummaryCard({ label, value, note, icon: Icon }) {
    return (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[#6f85a3]">{label}</p>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7]">
                    <Icon size={20} />
                </div>
            </div>
            <p className="text-2xl font-extrabold text-[#07102f]">{value}</p>
            <p className="mt-2 truncate text-xs font-semibold text-[#6f85a3]" title={note}>
                {note}
            </p>
        </div>
    );
}

function Alert({ type, message }) {
    const isSuccess = type === "success";
    const Icon = isSuccess ? CheckCircle2 : XCircle;
    return (
        <div
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${
                isSuccess
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-red-100 bg-red-50 text-red-600"
            }`}
        >
            <Icon size={18} />
            <span>{message}</span>
        </div>
    );
}

function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
}

function formatFileSize(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

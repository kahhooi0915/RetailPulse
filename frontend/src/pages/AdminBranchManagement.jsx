import DashboardLayout from "../layouts/DashboardLayout";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Building2,
    Search,
    Plus,
    Pencil,
    Power,
    MapPin,
    Phone,
    X,
    RefreshCcw,
    Warehouse,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

const emptyForm = {
    branch_name: "",
    branch_address: "",
    phone: "",
    branch_type: "BRANCH",
    status: "ACTIVE",
};

const formatPhoneNumber = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    if (digits.length <= 2) return digits;

    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
};

const validatePhone = (phone) => {
    if (!phone.trim()) return "";
    if (!/^\d{2}-\d{7,8}$/.test(phone)) {
        return "Phone number must be in XX-XXXXXXX format.";
    }
    return "";
};

export default function AdminBranchManagement() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [branches, setBranches] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editBranch, setEditBranch] = useState(null);
    const [formData, setFormData] = useState(emptyForm);

    const [fieldErrors, setFieldErrors] = useState({
        phone: "",
    });

    const [toast, setToast] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [settingsData, setSettingsData] = useState(() => {
        const savedSettings = sessionStorage.getItem("adminSettings");

        return savedSettings
            ? JSON.parse(savedSettings)
            : {
                lowStockAlert: true,
                salesAlert: true,
                systemNotification: true,
                compactMode: false,
                dashboardView: "Monthly",
            };
    });

    useEffect(() => {
        const savedUser = JSON.parse(sessionStorage.getItem("user"));

        if (!savedUser) {
            navigate("/");
            return;
        }

        setUser(savedUser);
    }, [navigate]);

    useEffect(() => {
        if (user) {
            loadBranches();
        }
    }, [user]);

    const showToast = (message, type = "success") => {
        setToast({ message, type });

        setTimeout(() => {
            setToast(null);
        }, 2500);
    };

    const loadBranches = async () => {
        try {
            setLoading(true);

            const res = await fetch(`${API_BASE}/admin/branches`, { credentials: "include" });
            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to load branches.", "error");
                return;
            }

            setBranches(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error(error);
            showToast("Failed to load branch management data.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredBranches = useMemo(() => {
        return branches.filter((item) => {
            const keyword = searchTerm.toLowerCase();

            return (
                item.branch_code?.toLowerCase().includes(keyword) ||
                item.branch_name?.toLowerCase().includes(keyword) ||
                item.branch_address?.toLowerCase().includes(keyword) ||
                item.phone?.toLowerCase().includes(keyword) ||
                item.branch_type?.toLowerCase().includes(keyword) ||
                item.status?.toLowerCase().includes(keyword)
            );
        });
    }, [branches, searchTerm]);

    const totalBranches = branches.length;
    const activeBranches = branches.filter((item) => item.status !== "INACTIVE").length;
    const inactiveBranches = branches.filter((item) => item.status === "INACTIVE").length;
    const warehouses = branches.filter((item) => item.branch_type === "WAREHOUSE" && item.status !== "INACTIVE").length;
    const branchesWithAddress = branches.filter((item) =>
        item.branch_address?.trim()
    ).length;
    const branchesWithPhone = branches.filter((item) =>
        item.phone?.trim()
    ).length;
    const incompleteBranches = branches.filter(
        (item) => !item.branch_address?.trim() || !item.phone?.trim()
    ).length;

    const openAddForm = () => {
        setEditBranch(null);
        setFormData(emptyForm);
        setFieldErrors({ phone: "" });
        setShowForm(true);
    };

    const openEditForm = (selectedBranch) => {
        setEditBranch(selectedBranch);

        setFormData({
            branch_name: selectedBranch.branch_name || "",
            branch_address: selectedBranch.branch_address || "",
            phone: selectedBranch.phone || "",
            branch_type: selectedBranch.branch_type || "BRANCH",
            status: selectedBranch.status || "ACTIVE",
        });

        setFieldErrors({ phone: "" });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditBranch(null);
        setFormData(emptyForm);
        setFieldErrors({ phone: "" });
    };

    const handleFormChange = (field, value) => {
        let finalValue = value;

        if (field === "phone") {
            finalValue = formatPhoneNumber(value);
        }

        setFormData((prev) => ({
            ...prev,
            [field]: finalValue,
        }));

        if (field === "phone") {
            setFieldErrors((prev) => ({
                ...prev,
                phone: validatePhone(finalValue),
            }));
        }
    };

    const validateForm = () => {
        const phoneError = validatePhone(formData.phone);

        setFieldErrors({
            phone: phoneError,
        });

        if (!formData.branch_name.trim()) return "Branch name is required.";
        if (!formData.branch_address.trim()) return "Branch address is required.";
        if (!formData.phone.trim()) return "Phone number is required.";
        if (!["BRANCH", "WAREHOUSE"].includes(formData.branch_type)) {
            return "Branch type is invalid.";
        }
        if (!["ACTIVE", "INACTIVE"].includes(formData.status)) {
            return "Status is invalid.";
        }
        if (phoneError) return phoneError;

        return null;
    };

    const saveBranch = async (e) => {
        e.preventDefault();

        const error = validateForm();

        if (error) {
            showToast(error, "error");
            return;
        }

        try {
            setSaving(true);

            const payload = {
                branch_name: formData.branch_name.trim(),
                branch_address: formData.branch_address.trim(),
                phone: formData.phone.trim(),
                branch_type: formData.branch_type,
                status: formData.status,
            };

            const url = editBranch
                ? `${API_BASE}/admin/branches/${editBranch.branch_id}`
                : `${API_BASE}/admin/branches`;

            const method = editBranch ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to save branch.", "error");
                return;
            }

            showToast(
                editBranch
                    ? "Branch updated successfully."
                    : "Branch added successfully."
            );

            closeForm();
            loadBranches();
        } catch (error) {
            console.error(error);
            showToast("Failed to save branch.", "error");
        } finally {
            setSaving(false);
        }
    };

    const inactivateBranch = async (selectedBranch) => {
        if (selectedBranch.status === "INACTIVE") {
            showToast("Branch is already inactive.", "error");
            return;
        }

        const confirmInactivate = window.confirm(
            `Inactivate ${selectedBranch.branch_name}? It will stay in history but cannot be used as an active branch.`
        );

        if (!confirmInactivate) return;

        try {
            const res = await fetch(
                `${API_BASE}/admin/branches/${selectedBranch.branch_id}`,
                {
                    method: "DELETE",
                    credentials: "include",
                }
            );

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to delete branch.", "error");
                return;
            }

            showToast("Branch inactivated successfully.");
            loadBranches();
        } catch (error) {
            console.error(error);
            showToast("Failed to inactivate branch.", "error");
        }
    };

    return (
        <>
            <DashboardLayout
                user={user}
                title="Branch Management"
                subtitle="Create, update, view, and manage branch and warehouse records."
                modelText={`Current View: ${settingsData.dashboardView}`}
                onRefresh={loadBranches}
                onOpenSettings={() => setShowSettings(true)}
                onOpenNotifications={() => setShowNotifications(true)}
                onOpenChat={() => setShowHelp(true)}
                notificationCount={incompleteBranches}
                compactMode={settingsData.compactMode}
            >
                {loading ? (
                    <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
                        <div className="text-center">
                            <Building2 size={42} className="mx-auto mb-3" />
                            <p className="font-semibold">Loading Branch Management...</p>
                        </div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        <section className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
                            <SummaryCard
                                title="Total Locations"
                                value={totalBranches}
                                icon={Building2}
                                color="text-[#1e4db7]"
                            />
                            <SummaryCard
                                title="Active Locations"
                                value={activeBranches}
                                icon={MapPin}
                                color="text-green-600"
                            />
                            <SummaryCard
                                title="Warehouses"
                                value={warehouses}
                                icon={Warehouse}
                                color="text-[#07102f]"
                            />
                            <SummaryCard
                                title="Inactive"
                                value={inactiveBranches}
                                icon={RefreshCcw}
                                color="text-red-500"
                            />
                        </section>

                        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        Branch Records
                                    </h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Admin can maintain branch and warehouse details used by users, inventory, sales, and stock transfers.
                                    </p>
                                </div>

                                <button
                                    onClick={openAddForm}
                                    className="ml-auto flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                >
                                    <Plus size={17} />
                                    Add Branch
                                </button>
                            </div>

                            <div className="mt-6 grid grid-cols-1 gap-4">
                                <div className="flex items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
                                    <Search size={18} className="text-[#6f85a3]" />
                                    <input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by branch code, name, type, address, phone, or status..."
                                        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0bb]"
                                    />
                                </div>
                            </div>

                            <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                        <tr>
                                            <th className="px-4 py-3">Branch</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Address</th>
                                            <th className="px-4 py-3">Phone</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredBranches.map((item) => (
                                            <tr key={item.branch_id} className="border-t bg-white">
                                                <td className="px-4 py-4">
                                                    <p className="font-extrabold text-[#17325c]">
                                                        {item.branch_name}
                                                    </p>
                                                    <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                                        {item.branch_code || `BID-${item.branch_id}`}
                                                    </p>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <span
                                                        className={`rounded-full px-3 py-1 text-xs font-extrabold ${item.branch_type === "WAREHOUSE"
                                                                ? "bg-purple-100 text-purple-700"
                                                                : "bg-blue-100 text-[#1e4db7]"
                                                            }`}
                                                    >
                                                        {item.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch"}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <StatusBadge status={item.status || "ACTIVE"} />
                                                </td>

                                                <td className="px-4 py-4">
                                                    <p className="max-w-[520px] font-semibold text-[#17325c]">
                                                        {item.branch_address || "-"}
                                                    </p>
                                                </td>

                                                <td className="px-4 py-4 font-semibold text-[#17325c]">
                                                    {item.phone || "-"}
                                                </td>

                                                <td className="px-4 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditForm(item)}
                                                            className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100"
                                                            title="Edit"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>

                                                        <button
                                                            onClick={() => inactivateBranch(item)}
                                                            disabled={item.status === "INACTIVE"}
                                                            className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                            title="Inactivate"
                                                        >
                                                            <Power size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}

                                        {filteredBranches.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan="6"
                                                    className="px-4 py-10 text-center font-semibold text-[#6f85a3]"
                                                >
                                                    No branch records found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </motion.div>
                )}
            </DashboardLayout>

            {showForm && (
                <Modal
                    title={editBranch ? "Update Branch" : "Add New Branch"}
                    subtitle={
                        editBranch
                            ? "Update branch name, type, address, and contact number."
                            : "Create a new branch or warehouse record for RetailPulse."
                    }
                    onClose={closeForm}
                >
                    <form onSubmit={saveBranch} className="space-y-5">
                        <FormInput
                            label="Branch Name"
                            value={formData.branch_name}
                            onChange={(value) => handleFormChange("branch_name", value)}
                            placeholder="Example: Ayer Keroh Branch"
                        />

                        <FormSelect
                            label="Branch Type"
                            value={formData.branch_type}
                            onChange={(value) => handleFormChange("branch_type", value)}
                            options={[
                                { value: "BRANCH", label: "Branch" },
                                { value: "WAREHOUSE", label: "Warehouse" },
                            ]}
                        />

                        <FormSelect
                            label="Status"
                            value={formData.status}
                            onChange={(value) => handleFormChange("status", value)}
                            options={[
                                { value: "ACTIVE", label: "Active" },
                                { value: "INACTIVE", label: "Inactive" },
                            ]}
                        />

                        <FormTextarea
                            label="Branch Address"
                            value={formData.branch_address}
                            onChange={(value) => handleFormChange("branch_address", value)}
                            placeholder="Example: Ayer Keroh, Melaka"
                        />

                        <FormInput
                            label="Phone"
                            value={formData.phone}
                            onChange={(value) => handleFormChange("phone", value)}
                            placeholder="06-2321002"
                            error={fieldErrors.phone}
                        />

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={closeForm}
                                className="w-full rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#254e7a] hover:bg-blue-100"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? "Saving..." : editBranch ? "Update Branch" : "Add Branch"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {showSettings && (
                <Modal
                    onClose={() => setShowSettings(false)}
                    title="Admin Settings"
                    subtitle="Configure and review admin dashboard options."
                >
                    <div className="space-y-6">
                        <SettingToggle
                            label="Low Stock Alerts"
                            value={settingsData.lowStockAlert}
                            onChange={() =>
                                setSettingsData({
                                    ...settingsData,
                                    lowStockAlert: !settingsData.lowStockAlert,
                                })
                            }
                        />

                        <SettingToggle
                            label="Sales Notifications"
                            value={settingsData.salesAlert}
                            onChange={() =>
                                setSettingsData({
                                    ...settingsData,
                                    salesAlert: !settingsData.salesAlert,
                                })
                            }
                        />

                        <SettingToggle
                            label="System Notifications"
                            value={settingsData.systemNotification}
                            onChange={() =>
                                setSettingsData({
                                    ...settingsData,
                                    systemNotification: !settingsData.systemNotification,
                                })
                            }
                        />

                        <SettingToggle
                            label="Compact Dashboard Mode"
                            value={settingsData.compactMode}
                            onChange={() =>
                                setSettingsData({
                                    ...settingsData,
                                    compactMode: !settingsData.compactMode,
                                })
                            }
                        />

                        <div>
                            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                                Default Analytics Range
                            </label>

                            <select
                                value={settingsData.dashboardView}
                                onChange={(e) =>
                                    setSettingsData({
                                        ...settingsData,
                                        dashboardView: e.target.value,
                                    })
                                }
                                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold outline-none"
                            >
                                <option>Daily</option>
                                <option>Weekly</option>
                                <option>Monthly</option>
                                <option>Yearly</option>
                            </select>
                        </div>

                        <button
                            onClick={() => {
                                sessionStorage.setItem(
                                    "adminSettings",
                                    JSON.stringify(settingsData)
                                );
                                setShowSettings(false);
                                showToast("Settings saved successfully.");
                            }}
                            className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986]"
                        >
                            Save Settings
                        </button>
                    </div>
                </Modal>
            )}

            {showHelp && (
                <Modal
                    onClose={() => setShowHelp(false)}
                    title="Branch Management Help Guide"
                    subtitle="Manage branch and warehouse information used throughout the system."
                >
                    <div className="space-y-5">
                        <div className="rounded-2xl bg-[#eef6fb] p-5">
                            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-[#1e4db7]">
                                What You Can Do
                            </h3>

                            <ul className="space-y-3 text-sm text-[#17325c]">
                                <li>• Add new retail branch or warehouse records.</li>
                                <li>• Update branch name, type, address, and phone number.</li>
                                <li>• Inactivate locations that are no longer used.</li>
                                <li>• Search locations by code, name, type, address, phone, or status.</li>
                                <li>• Review incomplete location information.</li>
                            </ul>
                        </div>

                        <div className="rounded-2xl bg-[#f8fcff] p-5">
                            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-[#07102f]">
                                Important Notes
                            </h3>

                            <ul className="space-y-3 text-sm leading-6 text-[#6f85a3]">
                                <li>• BRANCH represents a normal retail outlet.</li>
                                <li>• WAREHOUSE represents a central stock location.</li>
                                <li>• Both branch and warehouse records can be linked to inventory and stock transfers.</li>
                                <li>• Inactive branches stay available for historical records but should not be used for new operations.</li>
                            </ul>
                        </div>
                    </div>
                </Modal>
            )}

            {showNotifications && (
                <div className="fixed inset-0 z-50">
                    <div
                        onClick={() => setShowNotifications(false)}
                        className="absolute inset-0 bg-black/20"
                    />

                    <div className="absolute right-0 top-0 h-full w-[370px] bg-white p-6 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Notifications
                            </h2>

                            <button
                                onClick={() => setShowNotifications(false)}
                                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <NotificationCard
                                title="Incomplete Location Info"
                                desc={`${incompleteBranches} branch/warehouse record(s) missing address or phone.`}
                                color="orange"
                            />

                            <NotificationCard
                                title="Total Locations"
                                desc={`${totalBranches} location record(s) registered.`}
                                color="blue"
                            />

                            <NotificationCard
                                title="Warehouse Records"
                                desc={`${warehouses} warehouse record(s) registered.`}
                                color="green"
                            />
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 z-[60]">
                    <div
                        className={`rounded-2xl px-5 py-4 text-sm font-extrabold shadow-xl ${toast.type === "error"
                                ? "bg-red-500 text-white"
                                : "bg-green-600 text-white"
                            }`}
                    >
                        {toast.message}
                    </div>
                </div>
            )}
        </>
    );
}

function SummaryCard({ title, value, icon: Icon, color }) {
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                    {title}
                </p>

                <div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef6fb]">
                    <Icon size={18} className={color} />
                </div>
            </div>

            <h2 className={`mt-4 text-2xl font-extrabold ${color}`}>{value}</h2>
        </div>
    );
}

function StatusBadge({ status }) {
    const isActive = status === "ACTIVE";

    return (
        <span
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${isActive
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-500"
                }`}
        >
            {status}
        </span>
    );
}

function FormInput({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    error,
}) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>

            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full rounded-2xl px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb] ${error ? "bg-red-50 ring-2 ring-red-300" : "bg-[#eef6fb]"
                    }`}
            />

            {error && (
                <p className="mt-2 text-xs font-bold text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
}

function FormSelect({ label, value, onChange, options }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>

            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function FormTextarea({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows="4"
                className="w-full resize-none rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
            />
        </div>
    );
}

function Modal({ title, subtitle, children, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="max-h-[90vh] w-[520px] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#07102f]">
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                {subtitle}
                            </p>
                        )}
                    </div>

                    <button
                        onClick={onClose}
                        className="grid h-9 w-9 place-items-center rounded-full bg-[#eef6fb] text-[#254e7a]"
                    >
                        <X size={17} />
                    </button>
                </div>

                {children}
            </div>
        </div>
    );
}

function SettingToggle({ label, value, onChange }) {
    return (
        <div className="flex items-center justify-between rounded-2xl bg-[#f8fcff] px-4 py-4">
            <span className="font-bold text-[#17325c]">{label}</span>

            <button
                onClick={onChange}
                className={`relative h-7 w-14 rounded-full transition ${value ? "bg-[#1e4db7]" : "bg-gray-300"
                    }`}
            >
                <div
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${value ? "left-8" : "left-1"
                        }`}
                />
            </button>
        </div>
    );
}

function NotificationCard({ title, desc, color }) {
    const colorClass =
        color === "orange"
            ? "bg-orange-50 text-orange-600"
            : color === "green"
                ? "bg-green-50 text-green-600"
                : "bg-blue-50 text-[#1e4db7]";

    return (
        <div className={`rounded-2xl p-4 ${colorClass}`}>
            <p className="font-extrabold">{title}</p>
            <p className="mt-1 text-sm">{desc}</p>
        </div>
    );
}

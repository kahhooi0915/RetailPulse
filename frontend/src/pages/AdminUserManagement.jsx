import DashboardLayout from "../layouts/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Users,
    Search,
    Plus,
    Pencil,
    Trash2,
    UserCheck,
    UserX,
    X,
    ShieldCheck,
    Eye,
    EyeOff,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

const emptyForm = {
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "BRANCH_STAFF",
    branch_id: "",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;

const formatPhoneNumber = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);

    if (digits.length <= 3) return digits;

    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

const validateEmail = (email) => {
    if (!email.trim()) return "";
    if (!email.includes("@")) return "Email must include @ symbol.";
    if (!emailRegex.test(email)) return "Email format is invalid.";
    return "";
};

const validatePhone = (phone) => {
    if (!phone.trim()) return "";
    if (!/^\d{3}-\d{6,8}$/.test(phone)) {
        return "Phone number must be in XXX-XXXXXX format.";
    }
    return "";
};

const validatePassword = (password, isEditMode = false) => {
    if (isEditMode && !password.trim()) return "";
    if (!password.trim()) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!specialCharRegex.test(password)) {
        return "Password must include at least one special character.";
    }
    return "";
};

export default function AdminUserManagement() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");

    const [showForm, setShowForm] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [formData, setFormData] = useState(emptyForm);
    const [showPassword, setShowPassword] = useState(false);

    const [fieldErrors, setFieldErrors] = useState({
        email: "",
        phone: "",
        password: "",
    });

    const [toast, setToast] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

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
        const savedUser =
            JSON.parse(sessionStorage.getItem("user")) ||
            JSON.parse(sessionStorage.getItem("user"));

        if (!savedUser) {
            navigate("/");
            return;
        }

        setUser(savedUser);
    }, [navigate]);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const showToast = (message, type = "success") => {
        setToast({ message, type });

        setTimeout(() => {
            setToast(null);
        }, 2500);
    };

    const loadData = async () => {
        try {
            setLoading(true);

            const [usersRes, branchesRes] = await Promise.all([
                fetch(`${API_BASE}/admin/users`, { credentials: "include" }),
                fetch(`${API_BASE}/admin/branches`, { credentials: "include" }),
            ]);

            const usersData = await usersRes.json();
            const branchesData = await branchesRes.json();

            setUsers(Array.isArray(usersData) ? usersData : []);
            setBranches(Array.isArray(branchesData) ? branchesData : []);
        } catch (error) {
            console.error(error);
            showToast("Failed to load user management data.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = useMemo(() => {
        return users.filter((item) => {
            const keyword = searchTerm.toLowerCase();

            const matchesSearch =
                item.name?.toLowerCase().includes(keyword) ||
                item.email?.toLowerCase().includes(keyword) ||
                item.phone?.toLowerCase().includes(keyword) ||
                item.user_code?.toLowerCase().includes(keyword) ||
                item.branch_name?.toLowerCase().includes(keyword);

            const matchesRole = roleFilter === "ALL" || item.role === roleFilter;
            const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;

            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [users, searchTerm, roleFilter, statusFilter]);

    const totalAdmins = users.filter((item) => item.role === "SYSTEM_ADMIN").length;
    const totalManagers = users.filter((item) => item.role === "INVENTORY_MANAGER").length;
    const totalStaff = users.filter((item) => item.role === "BRANCH_STAFF").length;
    const inactiveUsers = users.filter((item) => item.status === "INACTIVE").length;

    const managerBranchIds = useMemo(() => {
        return users
            .filter((item) => item.role === "INVENTORY_MANAGER" && item.status !== "INACTIVE")
            .map((item) => Number(item.branch_id));
    }, [users]);

    const availableBranchesForForm = useMemo(() => {
        if (formData.role !== "INVENTORY_MANAGER") return branches;

        return branches.filter((branch) => {
            const branchId = Number(branch.branch_id);

            if (
                editUser?.role === "INVENTORY_MANAGER" &&
                Number(editUser.branch_id) === branchId
            ) {
                return true;
            }

            return !managerBranchIds.includes(branchId);
        });
    }, [branches, formData.role, managerBranchIds, editUser]);

    const openAddForm = () => {
        setEditUser(null);
        setFormData(emptyForm);
        setFieldErrors({ email: "", phone: "", password: "" });
        setShowPassword(false);
        setShowForm(true);
    };

    const openEditForm = (selectedUser) => {
        setEditUser(selectedUser);

        setFormData({
            name: selectedUser.name || "",
            email: selectedUser.email || "",
            phone: selectedUser.phone || "",
            password: "",
            role: selectedUser.role || "BRANCH_STAFF",
            branch_id: selectedUser.branch_id ? String(selectedUser.branch_id) : "",
        });

        setFieldErrors({ email: "", phone: "", password: "" });
        setShowPassword(false);
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditUser(null);
        setFormData(emptyForm);
        setFieldErrors({ email: "", phone: "", password: "" });
        setShowPassword(false);
    };

    const handleFormChange = (field, value) => {
        let finalValue = value;

        if (field === "phone") {
            finalValue = formatPhoneNumber(value);
        }

        setFormData((prev) => {
            const updated = {
                ...prev,
                [field]: finalValue,
            };

            if (field === "role" && value === "SYSTEM_ADMIN") {
                updated.branch_id = "";
            }

            return updated;
        });

        if (field === "email") {
            setFieldErrors((prev) => ({
                ...prev,
                email: validateEmail(finalValue),
            }));
        }

        if (field === "phone") {
            setFieldErrors((prev) => ({
                ...prev,
                phone: validatePhone(finalValue),
            }));
        }

        if (field === "password") {
            setFieldErrors((prev) => ({
                ...prev,
                password: validatePassword(finalValue, !!editUser),
            }));
        }
    };

    const validateForm = () => {
        const emailError = validateEmail(formData.email);
        const phoneError = validatePhone(formData.phone);
        const passwordError = validatePassword(formData.password, !!editUser);

        setFieldErrors({
            email: emailError,
            phone: phoneError,
            password: passwordError,
        });

        if (!formData.name.trim()) return "Name is required.";
        if (emailError) return emailError;
        if (phoneError) return phoneError;
        if (passwordError) return passwordError;

        if (formData.role !== "SYSTEM_ADMIN" && !formData.branch_id) {
            return "Branch is required for staff and manager.";
        }

        return null;
    };

    const saveUser = async (e) => {
        e.preventDefault();

        const error = validateForm();

        if (error) {
            showToast(error, "error");
            return;
        }

        try {
            setSaving(true);

            const payload = {
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                password: formData.password,
                role: formData.role,
                branch_id:
                    formData.role === "SYSTEM_ADMIN" ? null : Number(formData.branch_id),
            };

            const url = editUser
                ? `${API_BASE}/admin/users/${editUser.user_id}`
                : `${API_BASE}/admin/users`;

            const method = editUser ? "PUT" : "POST";

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
                showToast(data.message || "Failed to save user.", "error");
                return;
            }

            showToast(editUser ? "User updated successfully." : "User added successfully.");
            closeForm();
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to save user.", "error");
        } finally {
            setSaving(false);
        }
    };

    const deleteUser = async (selectedUser) => {
        const confirmDelete = window.confirm(
            `Delete ${selectedUser.name}? This action cannot be undone.`
        );

        if (!confirmDelete) return;

        try {
            const res = await fetch(`${API_BASE}/admin/users/${selectedUser.user_id}`, {
                method: "DELETE",
                credentials: "include",
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to delete user.", "error");
                return;
            }

            showToast("User deleted successfully.");
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to delete user.", "error");
        }
    };

    const toggleUserStatus = async (selectedUser) => {
        const isActive = selectedUser.status === "ACTIVE";
        const action = isActive ? "deactivate" : "activate";

        try {
            const res = await fetch(
                `${API_BASE}/admin/users/${selectedUser.user_id}/${action}`,
                {
                    method: "PUT",
                    credentials: "include",
                }
            );

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || `Failed to ${action} user.`, "error");
                return;
            }

            showToast(data.message || `User ${action}d successfully.`);
            loadData();
        } catch (error) {
            console.error(error);
            showToast(`Failed to ${action} user.`, "error");
        }
    };

    const getRoleLabel = (role) => {
        if (role === "SYSTEM_ADMIN") return "System Admin";
        if (role === "INVENTORY_MANAGER") return "Inventory Manager";
        if (role === "BRANCH_STAFF") return "Branch Staff";
        return role;
    };

    return (
        <>
            <DashboardLayout
                user={user}
                title="User Management"
                subtitle="Register, update, activate, deactivate, and manage system users."
                modelText={`Current View: ${settingsData.dashboardView}`}
                onRefresh={loadData}
                onOpenSettings={() => setShowSettings(true)}
                onOpenNotifications={() => setShowNotifications(true)}
                onOpenChat={() => setShowHelp(true)}
                notificationCount={inactiveUsers}
                compactMode={settingsData.compactMode}
            >
                {loading ? (
                    <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
                        <div className="text-center">
                            <Users size={42} className="mx-auto mb-3" />
                            <p className="font-semibold">Loading User Management...</p>
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
                                title="Total Users"
                                value={users.length}
                                icon={Users}
                                color="text-[#1e4db7]"
                            />
                            <SummaryCard
                                title="System Admins"
                                value={totalAdmins}
                                icon={ShieldCheck}
                                color="text-[#07102f]"
                            />
                            <SummaryCard
                                title="Managers"
                                value={totalManagers}
                                icon={UserCheck}
                                color="text-green-600"
                            />
                            <SummaryCard
                                title="Inactive Users"
                                value={inactiveUsers}
                                icon={UserX}
                                color="text-red-500"
                            />
                        </section>

                        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        User Accounts
                                    </h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Admin can register accounts for staff, manager, and admin.
                                    </p>
                                </div>

                                <button
                                    onClick={openAddForm}
                                    className="ml-auto flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                >
                                    <Plus size={17} />
                                    Add User
                                </button>
                            </div>

                            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_220px_180px]">
                                <div className="flex items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
                                    <Search size={18} className="text-[#6f85a3]" />
                                    <input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by name, email, phone, user code, branch..."
                                        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0bb]"
                                    />
                                </div>

                                <select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="rounded-2xl bg-[#eef6fb] px-4 py-3 text-sm font-bold text-[#17325c] outline-none"
                                >
                                    <option value="ALL">All Roles</option>
                                    <option value="SYSTEM_ADMIN">System Admin</option>
                                    <option value="INVENTORY_MANAGER">Inventory Manager</option>
                                    <option value="BRANCH_STAFF">Branch Staff</option>
                                </select>

                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="rounded-2xl bg-[#eef6fb] px-4 py-3 text-sm font-bold text-[#17325c] outline-none"
                                >
                                    <option value="ALL">All Status</option>
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                </select>
                            </div>

                            <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                        <tr>
                                            <th className="px-4 py-3">User</th>
                                            <th className="px-4 py-3">Contact</th>
                                            <th className="px-4 py-3">Role</th>
                                            <th className="px-4 py-3">Branch</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredUsers.map((item) => (
                                            <tr key={item.user_id} className="border-t bg-white">
                                                <td className="px-4 py-4">
                                                    <p className="font-extrabold text-[#17325c]">
                                                        {item.name}
                                                    </p>
                                                    <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                                        {item.user_code || `UID-${item.user_id}`}
                                                    </p>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <p className="font-semibold text-[#17325c]">
                                                        {item.email}
                                                    </p>
                                                    <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                                        {item.phone}
                                                    </p>
                                                </td>

                                                <td className="px-4 py-4">
                                                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-[#1e4db7]">
                                                        {getRoleLabel(item.role)}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-4 font-semibold text-[#17325c]">
                                                    {item.role === "SYSTEM_ADMIN"
                                                        ? "All Branches"
                                                        : item.branch_name || "-"}
                                                </td>

                                                <td className="px-4 py-4">
                                                    <span
                                                        className={`rounded-full px-3 py-1 text-xs font-extrabold ${item.status === "ACTIVE"
                                                                ? "bg-green-50 text-green-600"
                                                                : "bg-red-50 text-red-500"
                                                            }`}
                                                    >
                                                        {item.status || "ACTIVE"}
                                                    </span>
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
                                                            onClick={() => toggleUserStatus(item)}
                                                            className={`grid h-9 w-9 place-items-center rounded-xl ${item.status === "ACTIVE"
                                                                    ? "bg-orange-50 text-orange-600 hover:bg-orange-100"
                                                                    : "bg-green-50 text-green-600 hover:bg-green-100"
                                                                }`}
                                                            title={
                                                                item.status === "ACTIVE"
                                                                    ? "Deactivate"
                                                                    : "Activate"
                                                            }
                                                        >
                                                            {item.status === "ACTIVE" ? (
                                                                <UserX size={16} />
                                                            ) : (
                                                                <UserCheck size={16} />
                                                            )}
                                                        </button>

                                                        <button
                                                            onClick={() => deleteUser(item)}
                                                            className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}

                                        {filteredUsers.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan="6"
                                                    className="px-4 py-10 text-center font-semibold text-[#6f85a3]"
                                                >
                                                    No user records found.
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
                    title={editUser ? "Update User" : "Register New User"}
                    subtitle={
                        editUser
                            ? "Update user account details."
                            : "Create an account for staff, manager, or admin."
                    }
                    onClose={closeForm}
                >
                    <form onSubmit={saveUser} className="space-y-5">
                        <FormInput
                            label="Full Name"
                            value={formData.name}
                            onChange={(value) => handleFormChange("name", value)}
                            placeholder="Example: TAN MEI LING"
                        />

                        <FormInput
                            label="Email"
                            value={formData.email}
                            onChange={(value) => handleFormChange("email", value)}
                            placeholder="example@email.com"
                            error={fieldErrors.email}
                        />

                        <FormInput
                            label="Phone"
                            value={formData.phone}
                            onChange={(value) => handleFormChange("phone", value)}
                            placeholder="012-3456789"
                            error={fieldErrors.phone}
                        />

                        <FormInput
                            label={editUser ? "Password (leave blank to keep current)" : "Password"}
                            type={showPassword ? "text" : "password"}
                            value={formData.password}
                            onChange={(value) => handleFormChange("password", value)}
                            placeholder="Minimum 8 characters and one special character"
                            error={fieldErrors.password}
                            showPasswordToggle
                            isPasswordVisible={showPassword}
                            onPasswordPressStart={() => setShowPassword(true)}
                            onPasswordPressEnd={() => setShowPassword(false)}
                        />

                        <div>
                            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                                Role
                            </label>

                            <select
                                value={formData.role}
                                onChange={(e) => handleFormChange("role", e.target.value)}
                                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none"
                            >
                                <option value="BRANCH_STAFF">Branch Staff</option>
                                <option value="INVENTORY_MANAGER">Inventory Manager</option>
                                <option value="SYSTEM_ADMIN">System Admin</option>
                            </select>
                        </div>

                        {formData.role !== "SYSTEM_ADMIN" && (
                            <div>
                                <label className="mb-2 block text-sm font-bold text-[#17325c]">
                                    Branch
                                </label>

                                <select
                                    value={formData.branch_id}
                                    onChange={(e) => handleFormChange("branch_id", e.target.value)}
                                    className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none"
                                >
                                    <option value="">Select Branch</option>
                                    {availableBranchesForForm.map((branch) => (
                                        <option key={branch.branch_id} value={branch.branch_id}>
                                            {branch.branch_name}
                                        </option>
                                    ))}
                                </select>

                                {formData.role === "INVENTORY_MANAGER" &&
                                    availableBranchesForForm.length === 0 && (
                                        <p className="mt-2 text-xs font-bold text-red-500">
                                            All branches already have an active manager.
                                        </p>
                                    )}
                            </div>
                        )}

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
                                {saving ? "Saving..." : editUser ? "Update User" : "Add User"}
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
                    title="User Management Help Guide"
                    subtitle="Manage user accounts, roles, and branch assignments."
                >
                    <div className="space-y-5">
                        {/* Main Capabilities */}
                        <div className="rounded-2xl bg-[#eef6fb] p-5">
                            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-[#1e4db7]">
                                What You Can Do
                            </h3>

                            <ul className="space-y-3 text-sm text-[#17325c]">
                                <li>• Register new System Admin, Inventory Manager, and Branch Staff accounts.</li>
                                <li>• Update user details such as name, email, phone number, and role.</li>
                                <li>• Assign branch access for managers and staff.</li>
                                <li>• Activate or deactivate user accounts.</li>
                                <li>• Delete user accounts that are no longer needed.</li>
                                <li>• Search and filter users by role and status.</li>
                            </ul>
                        </div>

                        {/* Important Rules */}
                        <div className="rounded-2xl bg-[#f8fcff] p-5">
                            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-[#07102f]">
                                Important Rules
                            </h3>

                            <ul className="space-y-3 text-sm text-[#6f85a3] leading-6">
                                <li>• System Admin accounts do not require a branch assignment.</li>
                                <li>• Inventory Managers and Branch Staff must be assigned to a branch.</li>
                                <li>• Only one active Inventory Manager is allowed per branch.</li>
                                <li>• It is recommended to deactivate accounts instead of deleting users with historical records.</li>
                            </ul>
                        </div>

                        {/* Footer Note */}
                        <div className="rounded-2xl bg-amber-50 p-4">
                            <p className="text-sm leading-6 text-amber-700">
                                Deactivating a user preserves related sales and stock transfer history,
                                while preventing the user from logging into the system.
                            </p>
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
                                title="Inactive Users"
                                desc={`${inactiveUsers} inactive user account(s) found.`}
                                color="orange"
                            />

                            <NotificationCard
                                title="System Admins"
                                desc={`${totalAdmins} system admin account(s) registered.`}
                                color="blue"
                            />

                            <NotificationCard
                                title="Branch Users"
                                desc={`${totalManagers + totalStaff} branch user account(s) registered.`}
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

function FormInput({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    error,
    showPasswordToggle = false,
    isPasswordVisible = false,
    onPasswordPressStart,
    onPasswordPressEnd,
}) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>

            <div className="relative">
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-2xl py-3 pl-4 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb] ${showPasswordToggle ? "pr-12" : "pr-4"} ${error ? "bg-red-50 ring-2 ring-red-300" : "bg-[#eef6fb]"
                        }`}
                />

                {showPasswordToggle && (
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onPasswordPressStart?.();
                        }}
                        onMouseUp={onPasswordPressEnd}
                        onMouseLeave={onPasswordPressEnd}
                        onTouchStart={onPasswordPressStart}
                        onTouchEnd={onPasswordPressEnd}
                        className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#8aa0bb] transition duration-300 hover:text-[#0c2f73]"
                        aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    >
                        {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                )}
            </div>

            {error && (
                <p className="mt-2 text-xs font-bold text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
}

function Modal({ title, subtitle, children, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="max-h-[90vh] w-[520px] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#07102f]">{title}</h2>
                        {subtitle && (
                            <p className="mt-1 text-sm text-[#6f85a3]">{subtitle}</p>
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

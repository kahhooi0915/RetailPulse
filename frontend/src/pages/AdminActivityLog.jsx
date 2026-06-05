import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Search } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";

const API_BASE = "http://localhost:5000";

export default function AdminActivityLog() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [logs, setLogs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        module: "",
        action: "",
        audit_user_id: "",
        date_from: "",
        date_to: "",
    });

    useEffect(() => {
        const savedUser = JSON.parse(sessionStorage.getItem("user"));
        if (!savedUser || savedUser.role !== "SYSTEM_ADMIN") {
            navigate("/");
            return;
        }
        setUser(savedUser);
    }, [navigate]);

    useEffect(() => {
        if (user) {
            loadLogs();
            loadUsers();
        }
    }, [user]);

    const queryString = useMemo(() => {
        const params = new URLSearchParams({ user_id: user?.user_id || "" });
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        return params.toString();
    }, [filters, user]);

    const loadLogs = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/admin/audit-logs?${queryString}`);
            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error(error);
            alert("Failed to load activity logs.");
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        const res = await fetch(`${API_BASE}/admin/users`);
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
    };

    const updateFilter = (field, value) => {
        setFilters((prev) => ({ ...prev, [field]: value }));
    };

    const modules = [...new Set(logs.map((item) => item.module).filter(Boolean))];
    const actions = [...new Set(logs.map((item) => item.action).filter(Boolean))];

    return (
        <DashboardLayout
            user={user}
            title="Activity Log"
            subtitle="Review important business activities performed by RetailPulse users."
            onRefresh={loadLogs}
        >
            <div className="space-y-6">
                <section className="rounded-2xl bg-white p-5 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-5">
                        <FilterSelect label="Module" value={filters.module} options={modules} onChange={(value) => updateFilter("module", value)} />
                        <FilterSelect label="Action" value={filters.action} options={actions} onChange={(value) => updateFilter("action", value)} />
                        <label className="text-sm font-bold text-[#17325c]">
                            User
                            <select value={filters.audit_user_id} onChange={(e) => updateFilter("audit_user_id", e.target.value)} className="mt-2 w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm">
                                <option value="">All users</option>
                                {users.map((item) => (
                                    <option key={item.user_id} value={item.user_id}>{item.name}</option>
                                ))}
                            </select>
                        </label>
                        <FilterInput label="From" type="date" value={filters.date_from} onChange={(value) => updateFilter("date_from", value)} />
                        <FilterInput label="To" type="date" value={filters.date_to} onChange={(value) => updateFilter("date_to", value)} />
                    </div>

                    <button onClick={loadLogs} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0d2d6c] px-4 py-2 text-sm font-bold text-white">
                        <Search size={16} />
                        Apply Filters
                    </button>
                </section>

                <section className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <ClipboardList size={22} className="text-[#1e4db7]" />
                        <h2 className="text-xl font-extrabold text-[#07102f]">Audit Records</h2>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-blue-50">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                <tr>
                                    <th className="px-4 py-3">Date/Time</th>
                                    <th className="px-4 py-3">User Name</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3">Module</th>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((item) => (
                                    <tr key={item.audit_id} className="border-t bg-white">
                                        <td className="px-4 py-4 font-semibold">{formatDateTime(item.created_at)}</td>
                                        <td className="px-4 py-4 font-bold">{item.user_name}</td>
                                        <td className="px-4 py-4">{item.role}</td>
                                        <td className="px-4 py-4">{item.module}</td>
                                        <td className="px-4 py-4 font-bold text-[#1e4db7]">{item.action}</td>
                                        <td className="px-4 py-4 text-[#4c6280]">{item.description}</td>
                                    </tr>
                                ))}
                                {!loading && logs.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-8 text-center font-semibold text-[#6f85a3]">No activity logs found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </DashboardLayout>
    );
}

function FilterSelect({ label, value, options, onChange }) {
    return (
        <label className="text-sm font-bold text-[#17325c]">
            {label}
            <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm">
                <option value="">All {label.toLowerCase()}s</option>
                {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </label>
    );
}

function FilterInput({ label, type, value, onChange }) {
    return (
        <label className="text-sm font-bold text-[#17325c]">
            {label}
            <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-blue-100 px-3 py-2 text-sm" />
        </label>
    );
}

function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
}

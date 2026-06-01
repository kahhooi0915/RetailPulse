import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BarChart3,
    Bell,
    Boxes,
    Building2,
    Package,
    RefreshCcw,
    Settings,
    ShoppingCart,
    TrendingUp,
    Users,
    AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import ManagerSidebar from "../components/ManagerSidebar";

const API_BASE = "http://localhost:5000";

export default function ManagerDashboard() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [sales, setSales] = useState([]);
    const [branches, setBranches] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [settingsData, setSettingsData] = useState({
        darkMode: false,
        lowStockAlert: true,
        transferNotification: true,
        weeklyReportReminder: true,
        compactMode: false,
        dashboardView: "Weekly",
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
        fetchData();
    }, [navigate]);

    const fetchData = async () => {
        try {
            setLoading(true);

            const [inventoryRes, salesRes, branchRes, productRes] = await Promise.all([
                fetch(`${API_BASE}/admin/inventory`),
                fetch(`${API_BASE}/admin/sales`),
                fetch(`${API_BASE}/admin/branches`),
                fetch(`${API_BASE}/admin/products`),
            ]);

            const inventoryData = await inventoryRes.json();
            const salesData = await salesRes.json();
            const branchData = await branchRes.json();
            const productData = await productRes.json();

            setInventory(Array.isArray(inventoryData) ? inventoryData : []);
            setSales(Array.isArray(salesData) ? salesData : []);
            setBranches(Array.isArray(branchData) ? branchData : []);
            setProducts(Array.isArray(productData) ? productData : []);
        } catch (error) {
            console.error(error);
            alert("Failed to load manager dashboard data.");
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("user");
        navigate("/");
    };

    const managerBranchInventory = useMemo(() => {
        if (!user?.branch_id) return inventory;
        return inventory.filter(
            (item) => Number(item.branch_id) === Number(user.branch_id)
        );
    }, [inventory, user]);

    const managerBranchSales = useMemo(() => {
        if (!user?.branch_id) return sales;
        return sales.filter((sale) => Number(sale.branch_id) === Number(user.branch_id));
    }, [sales, user]);

    const totalStock = managerBranchInventory.reduce(
        (sum, item) => sum + Number(item.quantity_in_stock || 0),
        0
    );

    const totalSales = managerBranchSales.reduce(
        (sum, sale) => sum + Number(sale.total_amount || 0),
        0
    );

    const lowStockItems = useMemo(() => {
        return managerBranchInventory.filter((item) => {
            const product = products.find(
                (product) => Number(product.product_id) === Number(item.product_id)
            );

            const reorderLevel = Number(product?.reorder_level || 10);
            return Number(item.quantity_in_stock || 0) <= reorderLevel;
        });
    }, [managerBranchInventory, products]);

    const topProducts = useMemo(() => {
        return [...managerBranchInventory]
            .sort((a, b) => Number(b.quantity_in_stock) - Number(a.quantity_in_stock))
            .slice(0, 5);
    }, [managerBranchInventory]);

    const branchPerformance = useMemo(() => {
        return branches.map((branch) => {
            const branchSales = sales.filter(
                (sale) => Number(sale.branch_id) === Number(branch.branch_id)
            );

            const branchInventory = inventory.filter(
                (item) => Number(item.branch_id) === Number(branch.branch_id)
            );

            return {
                ...branch,
                revenue: branchSales.reduce(
                    (sum, sale) => sum + Number(sale.total_amount || 0),
                    0
                ),
                transactions: branchSales.length,
                stock: branchInventory.reduce(
                    (sum, item) => sum + Number(item.quantity_in_stock || 0),
                    0
                ),
            };
        });
    }, [branches, sales, inventory]);

    const formatCurrency = (amount) => `RM ${Number(amount || 0).toFixed(2)}`;

    if (loading) {
        return (
            <div className="min-h-screen grid place-items-center bg-[#eef6fb] text-[#6f85a3]">
                <div className="text-center">
                    <BarChart3 size={42} className="mx-auto mb-3" />
                    <p className="font-semibold">Loading Manager Dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="flex h-screen w-full overflow-x-hidden">
                <ManagerSidebar user={user} onOpenHelp={() => setShowHelp(true)} />

                <motion.main
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6"
                >
                    <header className="mb-8 flex items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                Manager Dashboard
                            </h1>
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                Monitor branch stock, sales performance, and inventory alerts.
                            </p>
                        </div>

                        <div className="relative ml-auto flex items-center gap-3">
                            <button
                                onClick={fetchData}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <RefreshCcw size={18} />
                            </button>

                            <button
                                onClick={() => setShowNotifications(true)}
                                className="relative grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <Bell size={18} />
                                {lowStockItems.length > 0 && (
                                    <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                                        {lowStockItems.length}
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={() => setShowSettings(true)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <Settings size={18} />
                            </button>

                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-[#0d2d6c] font-bold text-white shadow"
                            >
                                {user?.name?.charAt(0)?.toUpperCase() || "M"}
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 top-14 z-50 w-48 rounded-2xl bg-white p-3 shadow-xl">
                                    <button
                                        onClick={() => navigate("/user-profile")}
                                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-[#17325c] hover:bg-[#eef6fb]"
                                    >
                                        User Profile
                                    </button>

                                    <button
                                        onClick={logout}
                                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-red-500 hover:bg-red-50"
                                    >
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </header>

                    <section className="mb-6 grid grid-cols-4 gap-5">
                        <SummaryCard
                            title="Branch Stock"
                            value={totalStock}
                            icon={Boxes}
                            color="text-[#1e4db7]"
                        />

                        <SummaryCard
                            title="Branch Sales"
                            value={formatCurrency(totalSales)}
                            icon={TrendingUp}
                            color="text-green-600"
                        />

                        <SummaryCard
                            title="Low Stock Items"
                            value={lowStockItems.length}
                            icon={AlertTriangle}
                            color="text-orange-600"
                        />

                        <SummaryCard
                            title="Sales Records"
                            value={managerBranchSales.length}
                            icon={ShoppingCart}
                            color="text-[#07102f]"
                        />
                    </section>

                    <section className="mb-6 grid grid-cols-[1.35fr_0.65fr] gap-6">
                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        Branch Performance
                                    </h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Sales revenue comparison across all branches.
                                    </p>
                                </div>

                                <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-[#1e4db7]">
                                    {branches.length} branch(es)
                                </span>
                            </div>

                            <div className="space-y-4">
                                {branchPerformance.map((branch) => {
                                    const maxRevenue = Math.max(
                                        ...branchPerformance.map((item) => item.revenue),
                                        1
                                    );

                                    const width = `${(branch.revenue / maxRevenue) * 100}%`;

                                    return (
                                        <div key={branch.branch_id}>
                                            <div className="mb-2 flex items-center justify-between text-sm">
                                                <div className="font-extrabold text-[#17325c]">
                                                    {branch.branch_name}
                                                </div>
                                                <div className="font-bold text-[#6f85a3]">
                                                    {formatCurrency(branch.revenue)}
                                                </div>
                                            </div>

                                            <div className="h-3 overflow-hidden rounded-full bg-[#eef6fb]">
                                                <div
                                                    className="h-full rounded-full bg-[#1e4db7]"
                                                    style={{ width }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}

                                {branchPerformance.length === 0 && (
                                    <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                                        No branch performance data found.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="mb-5">
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    Low Stock Alerts
                                </h2>
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    Items that need restocking.
                                </p>
                            </div>

                            <div className="space-y-3">
                                {lowStockItems.slice(0, 5).map((item) => (
                                    <div
                                        key={`${item.product_id}-${item.branch_id}`}
                                        className="rounded-2xl bg-orange-50 p-4"
                                    >
                                        <p className="font-extrabold text-orange-600">
                                            {item.product_name}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                                            Remaining: {item.quantity_in_stock}
                                        </p>
                                    </div>
                                ))}

                                {lowStockItems.length === 0 && (
                                    <div className="rounded-xl bg-green-50 p-5 text-sm font-semibold text-green-600">
                                        All branch stock levels are stable.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="mb-6 grid grid-cols-2 gap-6">
                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                                Top Stock Products
                            </h2>

                            <div className="space-y-3">
                                {topProducts.map((item) => (
                                    <div
                                        key={`${item.product_id}-${item.branch_id}`}
                                        className="flex items-center justify-between rounded-2xl bg-[#f8fcff] p-4"
                                    >
                                        <div>
                                            <p className="font-extrabold text-[#17325c]">
                                                {item.product_name}
                                            </p>
                                            <p className="text-xs font-bold text-[#6f85a3]">
                                                {item.product_code}
                                            </p>
                                        </div>

                                        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-extrabold text-[#1e4db7]">
                                            {item.quantity_in_stock}
                                        </span>
                                    </div>
                                ))}

                                {topProducts.length === 0 && (
                                    <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                                        No inventory data found.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                                Recent Branch Sales
                            </h2>

                            <div className="overflow-hidden rounded-2xl border border-blue-50">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                        <tr>
                                            <th className="px-4 py-3">Sale Code</th>
                                            <th className="px-4 py-3">Amount</th>
                                            <th className="px-4 py-3">Payment</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {managerBranchSales.slice(0, 6).map((sale) => (
                                            <tr key={sale.sale_id} className="border-t">
                                                <td className="px-4 py-4 font-bold">{sale.sale_code}</td>
                                                <td className="px-4 py-4 font-bold text-green-600">
                                                    {formatCurrency(sale.total_amount)}
                                                </td>
                                                <td className="px-4 py-4">{sale.payment_method}</td>
                                            </tr>
                                        ))}

                                        {managerBranchSales.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan="3"
                                                    className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                                                >
                                                    No recent branch sales found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    All Branch Summary
                                </h2>
                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    Stock and transaction overview by branch.
                                </p>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-blue-50">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                    <tr>
                                        <th className="px-4 py-3">Branch</th>
                                        <th className="px-4 py-3">Revenue</th>
                                        <th className="px-4 py-3">Transactions</th>
                                        <th className="px-4 py-3">Stock</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {branchPerformance.map((branch) => (
                                        <tr key={branch.branch_id} className="border-t">
                                            <td className="px-4 py-4 font-bold">
                                                {branch.branch_name}
                                            </td>
                                            <td className="px-4 py-4 font-bold text-green-600">
                                                {formatCurrency(branch.revenue)}
                                            </td>
                                            <td className="px-4 py-4">{branch.transactions}</td>
                                            <td className="px-4 py-4">{branch.stock}</td>
                                        </tr>
                                    ))}

                                    {branchPerformance.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan="4"
                                                className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                                            >
                                                No branch summary found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </motion.main>
            </div>

            {showSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-[520px] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-extrabold text-[#07102f]">
                                    Manager Settings
                                </h2>

                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    Configure dashboard preferences and notifications.
                                </p>
                            </div>

                            <button
                                onClick={() => setShowSettings(false)}
                                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-6">

                            {/* NOTIFICATIONS */}
                            <div>
                                <h3 className="mb-4 text-lg font-extrabold text-[#07102f]">
                                    Notifications
                                </h3>

                                <div className="space-y-3">
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
                                        label="Transfer Notifications"
                                        value={settingsData.transferNotification}
                                        onChange={() =>
                                            setSettingsData({
                                                ...settingsData,
                                                transferNotification:
                                                    !settingsData.transferNotification,
                                            })
                                        }
                                    />

                                    <SettingToggle
                                        label="Weekly Report Reminder"
                                        value={settingsData.weeklyReportReminder}
                                        onChange={() =>
                                            setSettingsData({
                                                ...settingsData,
                                                weeklyReportReminder:
                                                    !settingsData.weeklyReportReminder,
                                            })
                                        }
                                    />
                                </div>
                            </div>

                            {/* APPEARANCE */}
                            <div>
                                <h3 className="mb-4 text-lg font-extrabold text-[#07102f]">
                                    Appearance
                                </h3>

                                <div className="space-y-3">
                                    <SettingToggle
                                        label="Dark Mode"
                                        value={settingsData.darkMode}
                                        onChange={() =>
                                            setSettingsData({
                                                ...settingsData,
                                                darkMode: !settingsData.darkMode,
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
                                </div>
                            </div>

                            {/* DASHBOARD */}
                            <div>
                                <h3 className="mb-4 text-lg font-extrabold text-[#07102f]">
                                    Dashboard Preferences
                                </h3>

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
                                    </select>
                                </div>
                            </div>

                            {/* SAVE */}
                            <button
                                onClick={() => {
                                    setShowSettings(false);
                                    alert("Settings saved successfully.");
                                }}
                                className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986]"
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="w-[420px] rounded-3xl bg-white p-7 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-2xl font-extrabold text-[#07102f]">
                                Help Support
                            </h2>

                            <button
                                onClick={() => setShowHelp(false)}
                                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 text-sm text-[#17325c]">
                            <p>• Use the dashboard to monitor branch stock and sales.</p>
                            <p>• Check low stock alerts before creating stock transfer requests.</p>
                            <p>• Use Stock Transfer to approve, reject, or receive branch stock.</p>
                        </div>
                    </div>
                </div>
            )}

            {showNotifications && (
                <div className="fixed inset-0 z-50">
                    <div
                        onClick={() => setShowNotifications(false)}
                        className="absolute inset-0 bg-black/20"
                    />

                    <div className="absolute right-0 top-0 h-full w-[360px] bg-white p-6 shadow-2xl">
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
                            <div className="rounded-2xl bg-orange-50 p-4">
                                <p className="font-extrabold text-orange-600">
                                    Low Stock Alert
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {lowStockItems.length} item(s) need restocking.
                                </p>
                            </div>

                            <div className="rounded-2xl bg-blue-50 p-4">
                                <p className="font-extrabold text-[#1e4db7]">
                                    Branch Sales
                                </p>
                                <p className="mt-1 text-sm text-[#6f84a1]">
                                    {managerBranchSales.length} sales record(s) found for your branch.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
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

            <h2 className={`mt-4 text-3xl font-extrabold ${color}`}>{value}</h2>
        </div>
    );
}

function SettingToggle({ label, value, onChange }) {
    return (
        <div className="flex items-center justify-between rounded-2xl bg-[#f8fcff] px-4 py-4">
            <span className="font-bold text-[#17325c]">
                {label}
            </span>

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

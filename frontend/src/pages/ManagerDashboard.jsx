import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BarChart3,
    Bell,
    Boxes,
    ChartPie,
    LineChart as LineChartIcon,
    RefreshCcw,
    Settings,
    ShoppingCart,
    TrendingUp,
    AlertTriangle,
    FileSpreadsheet,
} from "lucide-react";
import { motion } from "framer-motion";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import ManagerSidebar from "../components/ManagerSidebar";
import { formatCurrency } from "../utils/formatCurrency";
import api from "../api/axios";

const API_BASE = "http://localhost:5000";
const STOCK_CHART_COLORS = ["#0c2f73", "#1e4db7", "#16a34a", "#f59e0b", "#ef4444"];

function getSavedUser() {
    try {
        return JSON.parse(sessionStorage.getItem("user"));
    } catch {
        return null;
    }
}

export default function ManagerDashboard() {
    const navigate = useNavigate();

    const [user] = useState(() => getSavedUser());
    const [inventory, setInventory] = useState([]);
    const [sales, setSales] = useState([]);
    const [saleDetails, setSaleDetails] = useState([]);
    const [branches, setBranches] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [stockChartType, setStockChartType] = useState("PIE");

    const [settingsData, setSettingsData] = useState({
        darkMode: false,
        lowStockAlert: true,
        transferNotification: true,
        weeklyReportReminder: true,
        compactMode: false,
        dashboardView: "Weekly",
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            const [inventoryRes, salesRes, saleDetailRes, branchRes, productRes] = await Promise.all([
                fetch(`${API_BASE}/admin/inventory`, { credentials: "include" }),
                fetch(`${API_BASE}/admin/sales`, { credentials: "include" }),
                fetch(`${API_BASE}/admin/sale-details`, { credentials: "include" }),
                fetch(`${API_BASE}/admin/branches`, { credentials: "include" }),
                fetch(`${API_BASE}/admin/products`, { credentials: "include" }),
            ]);

            const inventoryData = await inventoryRes.json();
            const salesData = await salesRes.json();
            const saleDetailData = await saleDetailRes.json();
            const branchData = await branchRes.json();
            const productData = await productRes.json();

            setInventory(Array.isArray(inventoryData) ? inventoryData : []);
            setSales(Array.isArray(salesData) ? salesData : []);
            setSaleDetails(Array.isArray(saleDetailData) ? saleDetailData : []);
            setBranches(Array.isArray(branchData) ? branchData : []);
            setProducts(Array.isArray(productData) ? productData : []);
        } catch (error) {
            console.error(error);
            alert("Failed to load manager dashboard data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user) {
            navigate("/");
            return;
        }

        const timeoutId = window.setTimeout(() => {
            fetchData();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [fetchData, navigate, user]);

    const logout = async () => {
        try {
            await api.post("/logout");
            sessionStorage.removeItem("user");
            navigate("/");
        } catch (error) {
            console.error(error);
            alert("Logout failed. Please try again.");
        }
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

    const managerBranchSaleDetails = useMemo(() => {
        const managerSaleIds = new Set(
            managerBranchSales.map((sale) => Number(sale.sale_id))
        );

        return saleDetails.filter((detail) =>
            managerSaleIds.has(Number(detail.sale_id))
        );
    }, [managerBranchSales, saleDetails]);

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

    const topStockChartData = useMemo(() => {
        return topProducts.map((item) => ({
            name: item.product_name,
            code: item.product_code,
            stock: Number(item.quantity_in_stock || 0),
        }));
    }, [topProducts]);

    const topSellingProducts = useMemo(() => {
        const totals = managerBranchSaleDetails.reduce((map, detail) => {
            const productId = Number(detail.product_id);
            const current = map.get(productId) || {
                product_id: productId,
                product_code: detail.product_code,
                product_name: detail.product_name,
                quantity: 0,
                revenue: 0,
            };

            current.quantity += Number(detail.quantity || 0);
            current.revenue += Number(detail.subtotal || 0);
            map.set(productId, current);
            return map;
        }, new Map());

        return [...totals.values()]
            .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
            .slice(0, 10);
    }, [managerBranchSaleDetails]);

    const retailBranches = useMemo(() => {
        return branches.filter((branch) => branch.branch_type !== "WAREHOUSE");
    }, [branches]);

    const branchPerformance = useMemo(() => {
        return retailBranches.map((branch) => {
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
    }, [retailBranches, sales, inventory]);

    const handleExportExcel = () => {
        const generatedAt = new Date();
        const fileDate = formatDateForFile(generatedAt);
        const workbookXml = buildManagerWorkbookXml({
            branchName: user?.branch_name || "Branch",
            managerName: user?.name || "Manager",
            generatedAt: generatedAt.toLocaleString(),
            totalStock,
            totalSales,
            lowStockItems,
            managerBranchSales,
            managerBranchInventory,
            topSellingProducts,
            branchPerformance,
            products,
        });
        const blob = new Blob([workbookXml], {
            type: "application/vnd.ms-excel;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `RetailPulse_Manager_Branch_Report_${fileDate}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

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
                                title="Refresh dashboard"
                            >
                                <RefreshCcw size={18} />
                            </button>

                            <button
                                onClick={handleExportExcel}
                                className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-[#17325c] shadow transition hover:bg-[#f8fcff]"
                                title="Download branch Excel report"
                            >
                                <FileSpreadsheet size={18} className="text-green-600" />
                                Excel
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
                                    {retailBranches.length} branch(es)
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
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                <h2 className="text-xl font-extrabold text-[#07102f]">
                                    Top Stock Products
                                </h2>

                                <div className="inline-flex rounded-xl border border-blue-100 bg-[#f8fcff] p-1">
                                    <ChartTypeButton
                                        active={stockChartType === "PIE"}
                                        icon={ChartPie}
                                        label="Pie chart"
                                        onClick={() => setStockChartType("PIE")}
                                    />
                                    <ChartTypeButton
                                        active={stockChartType === "BAR"}
                                        icon={BarChart3}
                                        label="Bar chart"
                                        onClick={() => setStockChartType("BAR")}
                                    />
                                    <ChartTypeButton
                                        active={stockChartType === "LINE"}
                                        icon={LineChartIcon}
                                        label="Line chart"
                                        onClick={() => setStockChartType("LINE")}
                                    />
                                </div>
                            </div>

                            <div className="h-[360px]">
                                {topStockChartData.length === 0 ? (
                                    <div className="grid h-full place-items-center rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                                        No inventory data found.
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        {stockChartType === "PIE" ? (
                                            <PieChart>
                                                <Pie
                                                    data={topStockChartData}
                                                    dataKey="stock"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="45%"
                                                    outerRadius={96}
                                                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {topStockChartData.map((entry, index) => (
                                                        <Cell
                                                            key={entry.code || entry.name}
                                                            fill={STOCK_CHART_COLORS[index % STOCK_CHART_COLORS.length]}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value) => [`${value} units`, "Stock"]} />
                                                <Legend />
                                            </PieChart>
                                        ) : stockChartType === "BAR" ? (
                                            <BarChart data={topStockChartData} margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis
                                                    dataKey="name"
                                                    interval={0}
                                                    tick={{ fontSize: 11 }}
                                                    angle={-18}
                                                    textAnchor="end"
                                                    height={70}
                                                />
                                                <YAxis allowDecimals={false} />
                                                <Tooltip formatter={(value) => [`${value} units`, "Stock"]} />
                                                <Bar dataKey="stock" radius={[8, 8, 0, 0]}>
                                                    {topStockChartData.map((entry, index) => (
                                                        <Cell
                                                            key={entry.code || entry.name}
                                                            fill={STOCK_CHART_COLORS[index % STOCK_CHART_COLORS.length]}
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        ) : (
                                            <LineChart data={topStockChartData} margin={{ top: 10, right: 18, left: -10, bottom: 30 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis
                                                    dataKey="name"
                                                    interval={0}
                                                    tick={{ fontSize: 11 }}
                                                    angle={-18}
                                                    textAnchor="end"
                                                    height={70}
                                                />
                                                <YAxis allowDecimals={false} />
                                                <Tooltip formatter={(value) => [`${value} units`, "Stock"]} />
                                                <Line
                                                    type="monotone"
                                                    dataKey="stock"
                                                    stroke="#0c2f73"
                                                    strokeWidth={3}
                                                    dot={{ r: 5, fill: "#1e4db7" }}
                                                    activeDot={{ r: 7 }}
                                                />
                                            </LineChart>
                                        )}
                                    </ResponsiveContainer>
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

function ChartTypeButton({ active, icon: Icon, label, onClick }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={`grid h-10 w-10 place-items-center rounded-lg transition ${
                active
                    ? "bg-[#0c2f73] text-white shadow-sm"
                    : "text-[#6f85a3] hover:bg-white hover:text-[#1e4db7]"
            }`}
        >
            <Icon size={18} />
        </button>
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

function buildManagerWorkbookXml({
    branchName,
    managerName,
    generatedAt,
    totalStock,
    totalSales,
    lowStockItems,
    managerBranchSales,
    managerBranchInventory,
    topSellingProducts,
    branchPerformance,
    products,
}) {
    const averageTransaction = managerBranchSales.length
        ? totalSales / managerBranchSales.length
        : 0;
    const unitsSold = topSellingProducts.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
    );
    const stockCoverage = unitsSold
        ? `${(totalStock / unitsSold).toFixed(1)} stock units per sold unit`
        : "No sales quantity recorded";
    const topSeller = topSellingProducts[0]?.product_name || "No sales data";
    const productById = new Map(
        products.map((product) => [Number(product.product_id), product])
    );

    const summaryRows = [
        [textCell("RetailPulse Manager Branch Report", "Title", { mergeAcross: 3 })],
        [textCell("Branch", "SummaryLabel"), textCell(branchName)],
        [textCell("Manager", "SummaryLabel"), textCell(managerName)],
        [textCell("Generated Date and Time", "SummaryLabel"), textCell(generatedAt)],
        [textCell("Branch Sales", "SummaryLabel"), numberCell(totalSales, "Currency")],
        [textCell("Sales Records", "SummaryLabel"), numberCell(managerBranchSales.length)],
        [textCell("Average Transaction Value", "SummaryLabel"), numberCell(averageTransaction, "Currency")],
        [textCell("Current Branch Stock", "SummaryLabel"), numberCell(totalStock)],
        [textCell("Low Stock Items", "SummaryLabel"), numberCell(lowStockItems.length)],
        [textCell("Top Selling Product", "SummaryLabel"), textCell(topSeller)],
        [textCell("Stock Coverage Signal", "SummaryLabel"), textCell(stockCoverage)],
    ];

    const salesRows = [
        headerRow(["Sale Code", "Date", "Cashier", "Payment Method", "Amount (RM)"]),
        ...managerBranchSales.map((sale) => [
            textCell(sale.sale_code || "-"),
            textCell(formatReportDate(sale.sale_date)),
            textCell(sale.user_name || "-"),
            textCell(sale.payment_method || "-"),
            numberCell(sale.total_amount, "Currency"),
        ]),
    ];

    const stockRows = [
        headerRow([
            "Product Code",
            "Product Name",
            "Current Stock",
            "Reorder Level",
            "Stock Status",
            "Last Updated",
        ]),
        ...managerBranchInventory
            .slice()
            .sort((a, b) => Number(a.quantity_in_stock || 0) - Number(b.quantity_in_stock || 0))
            .map((item) => {
                const product = productById.get(Number(item.product_id));
                const reorderLevel = Number(product?.reorder_level || 10);
                const quantity = Number(item.quantity_in_stock || 0);
                const status = quantity <= reorderLevel ? "Needs Restock" : "Stable";

                return [
                    textCell(item.product_code || product?.product_code || "-"),
                    textCell(item.product_name || product?.product_name || "-"),
                    numberCell(quantity),
                    numberCell(reorderLevel),
                    textCell(status, status === "Needs Restock" ? "Urgent" : "Sufficient"),
                    textCell(formatReportDate(item.last_updated)),
                ];
            }),
    ];

    const lowStockRows = [
        headerRow(["Product Code", "Product Name", "Remaining Stock", "Reorder Level", "Recommendation"]),
        ...lowStockItems.map((item) => {
            const product = productById.get(Number(item.product_id));
            const reorderLevel = Number(product?.reorder_level || 10);

            return [
                textCell(item.product_code || product?.product_code || "-"),
                textCell(item.product_name || product?.product_name || "-"),
                numberCell(item.quantity_in_stock),
                numberCell(reorderLevel),
                textCell("Restock or request transfer", "Urgent"),
            ];
        }),
    ];

    const topSellingRows = [
        headerRow(["Rank", "Product Code", "Product Name", "Quantity Sold", "Revenue (RM)"]),
        ...topSellingProducts.map((item, index) => [
            numberCell(index + 1),
            textCell(item.product_code || "-"),
            textCell(item.product_name || "-"),
            numberCell(item.quantity),
            numberCell(item.revenue, "Currency"),
        ]),
    ];

    const comparisonRows = [
        headerRow(["Branch", "Revenue (RM)", "Transactions", "Stock"]),
        ...branchPerformance.map((branch) => [
            textCell(branch.branch_name || "-"),
            numberCell(branch.revenue, "Currency"),
            numberCell(branch.transactions),
            numberCell(branch.stock),
        ]),
    ];

    const worksheets = [
        buildWorksheet("Executive Summary", summaryRows),
        buildWorksheet("Branch Sales", salesRows, { freezeHeader: true }),
        buildWorksheet("Branch Stock", stockRows, { freezeHeader: true }),
        buildWorksheet("Low Stock Alerts", lowStockRows, { freezeHeader: true }),
        buildWorksheet("Top Selling Products", topSellingRows, { freezeHeader: true }),
        buildWorksheet("Branch Comparison", comparisonRows, { freezeHeader: true }),
    ];

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${buildWorkbookStyles()}
${worksheets.join("\n")}
</Workbook>`;
}

function buildWorksheet(name, rows, options = {}) {
    const safeRows = rows.length ? rows : [[textCell("No data found")]];
    const columnCount = Math.max(
        ...safeRows.map((row) =>
            row.reduce((count, cell) => count + 1 + Number(cell.mergeAcross || 0), 0)
        ),
        1
    );
    const widths = getColumnWidths(safeRows, columnCount);

    return `<Worksheet ss:Name="${xmlEscape(name)}">
<Table>
${widths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join("\n")}
${safeRows.map(buildRowXml).join("\n")}
</Table>
${options.freezeHeader ? buildFrozenHeaderOptions() : ""}
</Worksheet>`;
}

function buildWorkbookStyles() {
    return `<Styles>
<Style ss:ID="Default" ss:Name="Normal">
<Alignment ss:Vertical="Center"/>
<Font ss:FontName="Calibri" ss:Size="11" ss:Color="#17325C"/>
</Style>
<Style ss:ID="Title">
<Alignment ss:Vertical="Center"/>
<Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/>
<Interior ss:Color="#0C2F73" ss:Pattern="Solid"/>
</Style>
<Style ss:ID="Header">
<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
<Interior ss:Color="#1E4DB7" ss:Pattern="Solid"/>
<Borders>${buildBorderXml("#B7CBE8")}</Borders>
</Style>
<Style ss:ID="SummaryLabel">
<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#07102F"/>
<Interior ss:Color="#EEF6FB" ss:Pattern="Solid"/>
<Borders>${buildBorderXml("#D9E8F7")}</Borders>
</Style>
<Style ss:ID="Currency">
<NumberFormat ss:Format="&quot;RM&quot; #,##0.00"/>
<Borders>${buildBorderXml("#E3ECF7")}</Borders>
</Style>
<Style ss:ID="Urgent">
<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#991B1B"/>
<Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
<Borders>${buildBorderXml("#FCA5A5")}</Borders>
</Style>
<Style ss:ID="Sufficient">
<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#166534"/>
<Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
<Borders>${buildBorderXml("#86EFAC")}</Borders>
</Style>
<Style ss:ID="Cell">
<Borders>${buildBorderXml("#E3ECF7")}</Borders>
</Style>
</Styles>`;
}

function buildFrozenHeaderOptions() {
    return `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
<FreezePanes/>
<FrozenNoSplit/>
<SplitHorizontal>1</SplitHorizontal>
<TopRowBottomPane>1</TopRowBottomPane>
<ActivePane>2</ActivePane>
</WorksheetOptions>`;
}

function buildBorderXml(color) {
    return `<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>`;
}

function getColumnWidths(rows, columnCount) {
    const widths = Array.from({ length: columnCount }, () => 80);

    rows.forEach((row) => {
        let columnIndex = 0;

        row.forEach((cell) => {
            const span = 1 + Number(cell.mergeAcross || 0);
            const textLength = String(cell.value ?? "").length;
            const calculatedWidth = Math.min(Math.max(textLength * 7 + 20, 80), 260);

            widths[columnIndex] = Math.max(widths[columnIndex], calculatedWidth);
            columnIndex += span;
        });
    });

    return widths.map((width) => Math.round(width));
}

function buildRowXml(row, rowIndex) {
    const height = rowIndex === 0 ? 28 : 22;

    return `<Row ss:Height="${height}">
${row.map(buildCellXml).join("\n")}
</Row>`;
}

function buildCellXml(cell) {
    const attributes = [
        `ss:StyleID="${cell.style || "Cell"}"`,
        cell.mergeAcross ? `ss:MergeAcross="${cell.mergeAcross}"` : "",
    ]
        .filter(Boolean)
        .join(" ");

    return `<Cell ${attributes}><Data ss:Type="${cell.type}">${xmlEscape(
        cell.value
    )}</Data></Cell>`;
}

function headerRow(labels) {
    return labels.map((label) => textCell(label, "Header"));
}

function textCell(value, style = "Cell", options = {}) {
    return {
        type: "String",
        value: value ?? "",
        style,
        ...options,
    };
}

function numberCell(value, style = "Cell") {
    return {
        type: "Number",
        value: Number(value || 0).toFixed(2).replace(/\.00$/, ""),
        style,
    };
}

function xmlEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function formatDateForFile(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}${month}${day}`;
}

function formatReportDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString();
}

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  ChevronRight,
  FolderKanban,
  HelpCircle,
  LogOut,
  Package,
  RefreshCcw,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinned || sidebarHovered;

  const [settingsData, setSettingsData] = useState(() => {
    const savedSettings = localStorage.getItem("adminSettings");

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

  const [notificationRead, setNotificationRead] = useState(() => {
    return localStorage.getItem("adminNotificationRead") === "true";
  });

  useEffect(() => {
    const savedUser =
      JSON.parse(localStorage.getItem("user")) ||
      JSON.parse(sessionStorage.getItem("user"));

    if (!savedUser) {
      navigate("/");
      return;
    }

    setUser(savedUser);
  }, [navigate]);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [
        usersRes,
        branchesRes,
        productsRes,
        categoriesRes,
        inventoryRes,
        salesRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/admin/users`),
        fetch(`${API_BASE}/admin/branches`),
        fetch(`${API_BASE}/admin/products`),
        fetch(`${API_BASE}/admin/categories`),
        fetch(`${API_BASE}/admin/inventory`),
        fetch(`${API_BASE}/admin/sales`),
      ]);

      const usersData = await usersRes.json();
      const branchesData = await branchesRes.json();
      const productsData = await productsRes.json();
      const categoriesData = await categoriesRes.json();
      const inventoryData = await inventoryRes.json();
      const salesData = await salesRes.json();

      setUsers(Array.isArray(usersData) ? usersData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
      setSales(Array.isArray(salesData) ? salesData : []);
    } catch (error) {
      console.error(error);
      alert("Failed to load admin dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => loadData();

  const logout = () => {
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    navigate("/");
  };

  const formatCurrency = (amount) => `RM ${Number(amount || 0).toFixed(2)}`;

  const totalSales = sales.reduce(
    (sum, sale) => sum + Number(sale.total_amount || 0),
    0
  );

  const lowStockItems = useMemo(() => {
    return inventory.filter((item) => {
      const product = products.find(
        (p) => Number(p.product_id) === Number(item.product_id)
      );
      const reorderLevel = Number(product?.reorder_level || 10);
      return Number(item.quantity_in_stock || 0) <= reorderLevel;
    });
  }, [inventory, products]);

  const notificationCount = notificationRead ? 0 : lowStockItems.length;

  useEffect(() => {
    const previousCount = Number(
      localStorage.getItem("adminLowStockCount") || 0
    );

    if (lowStockItems.length !== previousCount) {
      setNotificationRead(false);
      localStorage.setItem("adminNotificationRead", "false");
      localStorage.setItem("adminLowStockCount", String(lowStockItems.length));
    }
  }, [lowStockItems.length]);

  const branchPerformance = useMemo(() => {
    return branches.map((branch) => {
      const branchSales = sales.filter(
        (sale) => Number(sale.branch_id) === Number(branch.branch_id)
      );

      return {
        ...branch,
        revenue: branchSales.reduce(
          (sum, sale) => sum + Number(sale.total_amount || 0),
          0
        ),
        transactions: branchSales.length,
      };
    });
  }, [branches, sales]);

  const top10Branches = [...branchPerformance]
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 10);

  const bottom5Branches = [...branchPerformance]
    .sort((a, b) => Number(a.revenue || 0) - Number(b.revenue || 0))
    .slice(0, 5);

  const branchSalesPieData = top10Branches.slice(0, 5).map((branch) => ({
    name: branch.branch_name.replace("RetailPulse ", ""),
    value: Number(branch.revenue || 0),
  }));

  const pieColors = ["#1e4db7", "#22c55e", "#f97316", "#8b5cf6", "#ef4444"];

  const recentSales = [...sales].slice(-6).reverse();

  const topProducts = useMemo(() => {
    const grouped = {};

    inventory.forEach((item) => {
      const productId = item.product_id;

      if (!grouped[productId]) {
        grouped[productId] = {
          product_id: productId,
          product_code: item.product_code,
          product_name: item.product_name,
          quantity: 0,
        };
      }

      grouped[productId].quantity += Number(item.quantity_in_stock || 0);
    });

    return Object.values(grouped)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [inventory]);

  return (
    <div className="h-screen w-full overflow-hidden bg-[#eef6fb] text-[#17325c]">
      <div
        className={`grid h-full transition-all duration-300 ${sidebarOpen
            ? "grid-cols-[250px_minmax(0,1fr)]"
            : "grid-cols-[86px_minmax(0,1fr)]"
          }`}
      >
        <aside
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`relative flex min-h-0 flex-col bg-[#d9edf8] py-6 border-r border-blue-100 transition-all duration-300 ${sidebarOpen ? "px-5" : "px-3"
            }`}
        >
          <div
            className={`mb-8 flex items-center ${sidebarOpen ? "justify-between" : "justify-center"
              }`}
          >
            {sidebarOpen && (
              <div className="text-2xl font-extrabold text-[#1e4db7]">
                RetailPulse
              </div>
            )}

            <button
              onClick={() => setSidebarPinned(!sidebarPinned)}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#1e4db7] shadow"
              title={sidebarPinned ? "Collapse sidebar" : "Pin sidebar"}
            >
              <ChevronRight
                size={18}
                className={`transition-transform duration-300 ${sidebarPinned ? "rotate-180" : ""
                  }`}
              />
            </button>
          </div>

          {sidebarOpen && (
            <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
              <h4 className="font-extrabold text-[#16325b]">
                {user?.name || "System Admin"}
              </h4>
              <p className="mt-1 text-xs text-[#6f85a3]">
                Admin ID: {user?.user_id || "-"}
              </p>
            </div>
          )}

          <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
            <SidebarButton sidebarOpen={sidebarOpen} active icon={BarChart3} label="Dashboard" />

            <SidebarButton sidebarOpen={sidebarOpen} icon={Users} label="User Management" onClick={() => navigate("/admin/users")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={Building2} label="Branch Management" onClick={() => navigate("/admin/branches")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={FolderKanban} label="Catalog Management" onClick={() => navigate("/admin/catalog")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={Boxes} label="Inventory Overview" onClick={() => navigate("/admin/inventory")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={ShoppingCart} label="Sales Monitoring" onClick={() => navigate("/admin/sales")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={Truck} label="Stock Transfers" onClick={() => navigate("/admin/transfers")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={TrendingUp} label="Reports & Forecasting" onClick={() => navigate("/admin/reports")} />

            <SidebarButton sidebarOpen={sidebarOpen} icon={Bot} label="AI Assistant" onClick={() => navigate("/admin/assistant")} />
          </nav>

          <div className="mt-4">
            <SidebarButton
              sidebarOpen={sidebarOpen}
              icon={HelpCircle}
              label="Help Support"
              onClick={() => setShowHelp(true)}
            />
          </div>
        </aside>

        <motion.main
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className={`min-w-0 overflow-y-auto ${settingsData.compactMode ? "px-5 py-4" : "px-8 py-6"
            }`}
        >
          <header className="mb-8 flex items-center gap-5">
            <div>
              <h1 className="text-3xl font-extrabold text-[#07102f]">
                Admin Dashboard
              </h1>
              <p className="mt-1 text-sm text-[#6f85a3]">
                Monitor users, branches, products, inventory, sales, and system performance.
              </p>

              <p className="mt-1 text-xs font-bold text-[#1e4db7]">
                Current View: {settingsData.dashboardView}
              </p>
            </div>

            <div className="relative ml-auto flex items-center gap-3">
              <button
                onClick={refreshData}
                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
              >
                <RefreshCcw size={18} />
              </button>

              <button
                onClick={() => {
                  setShowNotifications(true);
                  setNotificationRead(true);
                  localStorage.setItem("adminNotificationRead", "true");
                }}
                className="relative grid h-11 w-11 place-items-center rounded-full bg-white shadow"
              >
                <Bell size={18} />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                    {notificationCount}
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
                {user?.name?.charAt(0)?.toUpperCase() || "A"}
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
                    className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-bold text-red-500 hover:bg-red-50"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </header>

          {loading ? (
            <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
              <div className="text-center">
                <BarChart3 size={42} className="mx-auto mb-3" />
                <p className="font-semibold">Loading admin dashboard data...</p>
              </div>
            </div>
          ) : (
            <>
              <section className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
                <SummaryCard title="Total Users" value={users.length} icon={Users} color="text-[#1e4db7]" />
                <SummaryCard title="Branches" value={branches.length} icon={Building2} color="text-[#1e4db7]" />
                <SummaryCard title="Products" value={products.length} icon={Package} color="text-green-600" />
                <SummaryCard title="Categories" value={categories.length} icon={FolderKanban} color="text-[#07102f]" />
              </section>

              <section className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
                <SummaryCard title="Total Sales" value={formatCurrency(totalSales)} icon={TrendingUp} color="text-green-600" />
                <SummaryCard title="Sales Records" value={sales.length} icon={ShoppingCart} color="text-[#1e4db7]" />
                <SummaryCard title="Inventory Records" value={inventory.length} icon={Boxes} color="text-[#07102f]" />
                <SummaryCard title="Low Stock Items" value={lowStockItems.length} icon={AlertTriangle} color="text-orange-600" />
              </section>

              <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    Branch Sales Performance
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Revenue comparison across all branches.
                  </p>

                  <div className="mt-5 space-y-4">
                    {top10Branches.map((branch) => {
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
                      <EmptyBox text="No branch performance data found." />
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    System Operations
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Latest system activity summary.
                  </p>

                  <div className="mt-5 space-y-4">
                    <ActivityDot color="bg-blue-600" title="Product Records" desc={`${products.length} product(s) available.`} />
                    <ActivityDot color="bg-green-600" title="Sales Records" desc={`${sales.length} sale transaction(s) recorded.`} />
                    <ActivityDot color="bg-orange-500" title="Low Stock Alert" desc={`${lowStockItems.length} item(s) below reorder level.`} />
                    <ActivityDot color="bg-slate-400" title="Branch Records" desc={`${branches.length} branch(es) registered.`} />
                  </div>
                </div>
              </section>

              <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    Top 5 Sales Distribution by Branch
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Visual breakdown of total sales revenue for the top five performing branches.
                  </p>

                  <div className="mt-6 h-[300px]">
                    {branchSalesPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={branchSalesPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          >
                            {branchSalesPieData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={pieColors[index % pieColors.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyBox text="No branch sales data available for chart." />
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    Inventory Status Overview
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Comparison between low stock and normal stock items.
                  </p>

                  <div className="mt-6 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Low Stock", value: lowStockItems.length },
                            {
                              name: "Normal Stock",
                              value: Math.max(inventory.length - lowStockItems.length, 0),
                            },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          <Cell fill="#ef4444" />
                          <Cell fill="#1e4db7" />
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <section className="mb-6">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#07102f]">
                    Lowest Performing Branches
                  </h2>
                  <p className="mt-1 text-sm text-[#6f85a3]">
                    Bottom 5 branches with the lowest sales revenue.
                  </p>

                  <div className="mt-5 space-y-4">
                    {bottom5Branches.map((branch) => (
                      <div
                        key={branch.branch_id}
                        className="flex items-center justify-between rounded-2xl bg-[#fff5f5] px-4 py-4"
                      >
                        <div>
                          <p className="font-extrabold text-[#17325c]">
                            {branch.branch_name}
                          </p>
                          <p className="text-xs font-semibold text-[#6f85a3]">
                            {branch.branch_code}
                          </p>
                        </div>

                        <span className="font-extrabold text-red-500">
                          {formatCurrency(branch.revenue)}
                        </span>
                      </div>
                    ))}

                    {bottom5Branches.length === 0 && (
                      <EmptyBox text="No branch sales data available." />
                    )}
                  </div>
                </div>
              </section>

              <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                    Top Stock Products
                  </h2>

                  <div className="space-y-3">
                    {topProducts.map((item) => (
                      <div key={item.product_id} className="flex items-center justify-between rounded-2xl bg-[#f8fcff] p-4">
                        <div>
                          <p className="font-extrabold text-[#17325c]">{item.product_name}</p>
                          <p className="text-xs font-bold text-[#6f85a3]">{item.product_code}</p>
                        </div>

                        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-extrabold text-[#1e4db7]">
                          {item.quantity}
                        </span>
                      </div>
                    ))}

                    {topProducts.length === 0 && <EmptyBox text="No product stock data found." />}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                    Critical Low Stock
                  </h2>

                  <div className="overflow-hidden rounded-2xl border border-blue-50">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                        <tr>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">Branch</th>
                          <th className="px-4 py-3">Stock</th>
                        </tr>
                      </thead>

                      <tbody>
                        {lowStockItems.slice(0, 6).map((item) => (
                          <tr key={`${item.product_id}-${item.branch_id}`} className="border-t">
                            <td className="px-4 py-4 font-bold">{item.product_name}</td>
                            <td className="px-4 py-4">{item.branch_name}</td>
                            <td className="px-4 py-4">
                              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-extrabold text-red-600">
                                {item.quantity_in_stock} left
                              </span>
                            </td>
                          </tr>
                        ))}

                        {lowStockItems.length === 0 && (
                          <tr>
                            <td colSpan="3" className="px-4 py-6 text-center font-semibold text-[#6f85a3]">
                              No critical low stock items found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                  Recent Sales
                </h2>

                <div className="overflow-hidden rounded-2xl border border-blue-50">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                      <tr>
                        <th className="px-4 py-3">Sale Code</th>
                        <th className="px-4 py-3">Branch</th>
                        <th className="px-4 py-3">Staff</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Payment</th>
                      </tr>
                    </thead>

                    <tbody>
                      {recentSales.map((sale) => (
                        <tr key={sale.sale_id} className="border-t">
                          <td className="px-4 py-4 font-bold">{sale.sale_code}</td>
                          <td className="px-4 py-4">{sale.branch_name}</td>
                          <td className="px-4 py-4">{sale.user_name}</td>
                          <td className="px-4 py-4 font-bold text-green-600">
                            {formatCurrency(sale.total_amount)}
                          </td>
                          <td className="px-4 py-4">{sale.payment_method}</td>
                        </tr>
                      ))}

                      {recentSales.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-4 py-6 text-center font-semibold text-[#6f85a3]">
                            No recent sales found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </motion.main>
      </div>

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} title="Admin Settings">
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
                localStorage.setItem("adminSettings", JSON.stringify(settingsData));
                setShowSettings(false);
                alert("Settings saved successfully.");
              }}
              className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986]"
            >
              Save Settings
            </button>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal onClose={() => setShowHelp(false)} title="Help Support">
          <div className="space-y-4 text-sm text-[#17325c]">
            <p>• Use the dashboard to monitor system-wide records.</p>
            <p>• Manage users, branches, catalog, inventory, and sales from the sidebar.</p>
            <p>• Low stock alerts show inventory records below the product reorder level.</p>
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
              <NotificationCard title="Low Stock Alert" desc={`${lowStockItems.length} item(s) need attention.`} color="orange" />
              <NotificationCard title="Sales Records" desc={`${sales.length} total sale record(s) found.`} color="blue" />
              <NotificationCard title="System Users" desc={`${users.length} user account(s) registered.`} color="green" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarButton({ icon: Icon, label, active, onClick, sidebarOpen }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex w-full items-center rounded-2xl py-4 text-left transition ${sidebarOpen ? "gap-3 px-4 justify-start" : "justify-center px-0"
        } ${active
          ? "bg-white font-bold text-[#1e4db7] shadow"
          : "bg-white/30 font-semibold text-[#254e7a] hover:bg-white/70"
        }`}
    >
      <Icon size={18} className="shrink-0" />

      {sidebarOpen && (
        <span className="min-w-0 truncate text-sm">
          {label}
        </span>
      )}
    </button>
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

function ActivityDot({ color, title, desc }) {
  return (
    <div className="flex gap-3">
      <span className={`mt-2 h-3 w-3 rounded-full ${color}`} />
      <div>
        <p className="font-extrabold text-[#17325c]">{title}</p>
        <p className="mt-1 text-sm text-[#6f85a3]">{desc}</p>
      </div>
    </div>
  );
}

function EmptyBox({ text }) {
  return (
    <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
      {text}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="max-h-[90vh] w-[520px] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-[#07102f]">{title}</h2>
            <p className="mt-1 text-sm text-[#6f85a3]">
              Configure and review admin dashboard options.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
          >
            ✕
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
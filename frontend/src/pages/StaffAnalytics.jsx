import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  BarChart3,
  History,
  User,
  LogOut,
  Bell,
  Settings,
  Package,
  TrendingUp,
  Users,
  Trophy,
  Boxes,
  CheckCircle,
  ChevronRight,
} from "lucide-react";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { formatCurrency } from "../utils/formatCurrency";
import api from "../api/axios";

const API_BASE = "http://localhost:5000";

export default function StaffAnalytics() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [saleDetails, setSaleDetails] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinned || sidebarHovered;
  //Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [eyeCareMode, setEyeCareMode] = useState(
    sessionStorage.getItem("eyeCareMode") === "true"
  );
  const [toast, setToast] = useState({ show: false, message: "" });
  const [chartType, setChartType] = useState(
    sessionStorage.getItem("analyticsChartType") || "BAR"
  );

  const [displayMode, setDisplayMode] = useState(
    sessionStorage.getItem("analyticsDisplayMode") || "REVENUE"
  );

  const [topProductsLimit, setTopProductsLimit] = useState(
    Number(sessionStorage.getItem("analyticsTopProductsLimit") || 5)
  );

  const [showLowStockPanel, setShowLowStockPanel] = useState(
    sessionStorage.getItem("analyticsShowLowStockPanel") !== "false"
  );

  const [showTopProductsPanel, setShowTopProductsPanel] = useState(
    sessionStorage.getItem("analyticsShowTopProductsPanel") !== "false"
  );

  //Low Stock Request Modal states
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRequestItem, setSelectedRequestItem] = useState(null);
  const [requestQuantity, setRequestQuantity] = useState("");
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [stockTransfers, setStockTransfers] = useState([]);

  useEffect(() => {
    const savedUser =
      JSON.parse(sessionStorage.getItem("user")) ||
      JSON.parse(sessionStorage.getItem("user"));

    if (!savedUser) {
      navigate("/");
      return;
    }

    setUser(savedUser);
    fetchAnalyticsData(savedUser);
  }, [navigate]);

  const fetchAnalyticsData = async (savedUser) => {
    try {
      setLoading(true);

      const [productRes, inventoryRes, salesRes, detailRes, branchUserRes, transferRes] =
        await Promise.all([
          fetch(`${API_BASE}/admin/products`, { credentials: "include" }),
          fetch(`${API_BASE}/admin/inventory`, { credentials: "include" }),
          fetch(`${API_BASE}/admin/sales`, { credentials: "include" }),
          fetch(`${API_BASE}/admin/sale-details`, { credentials: "include" }),
          fetch(`${API_BASE}/staff/branch-users`, { credentials: "include" }),
          fetch(`${API_BASE}/stock-transfers`, { credentials: "include" }),
        ]);

      const [productData, inventoryData, salesData, detailData, branchUserData, transferData] =
        await Promise.all([
          productRes.json(),
          inventoryRes.json(),
          salesRes.json(),
          detailRes.json(),
          branchUserRes.json(),
          transferRes.json(),
        ]);

      setProducts(Array.isArray(productData) ? productData : []);
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
      setSales(Array.isArray(salesData) ? salesData : []);
      setSaleDetails(Array.isArray(detailData) ? detailData : []);
      setUsers(Array.isArray(branchUserData) ? branchUserData : savedUser ? [savedUser] : []);
      setStockTransfers(Array.isArray(transferData) ? transferData : []);
    } catch (error) {
      console.error(error);
      alert("Failed to load analytics data.");
    } finally {
      setLoading(false);
    }
  };

  const branchInventory = useMemo(() => {
    return inventory.filter(
      (item) => Number(item.branch_id) === Number(user?.branch_id)
    );
  }, [inventory, user]);

  const branchSales = useMemo(() => {
    return sales.filter(
      (sale) => Number(sale.branch_id) === Number(user?.branch_id)
    );
  }, [sales, user]);

  const branchStaff = useMemo(() => {
    return users.filter(
      (u) => Number(u.branch_id) === Number(user?.branch_id)
    );
  }, [users, user]);

  const stockChartData = useMemo(() => {
    return branchInventory.map((item) => ({
      name: item.product_name,
      stock: Number(item.quantity_in_stock),
    }));
  }, [branchInventory]);

  //Low Stock Alert
  const lowStockItems = useMemo(() => {
  return branchInventory
    .map((stock) => {
      const product = products.find(
        (p) => Number(p.product_id) === Number(stock.product_id)
      );

      return {
        ...stock,
        reorder_level: product ? Number(product.reorder_level) : 0,
        status:
          Number(stock.quantity_in_stock) <=
          (product ? Number(product.reorder_level) : 0)
            ? "LOW"
            : "OK",
      };
    })
    .filter((item) => item.status === "LOW")
    .sort((a, b) => Number(a.quantity_in_stock) - Number(b.quantity_in_stock));
}, [branchInventory, products]);

  const availableSourceBranches = useMemo(() => {
    if (!selectedRequestItem) return [];

    return inventory
      .filter(
        (item) =>
          Number(item.product_id) === Number(selectedRequestItem.product_id) &&
          Number(item.branch_id) !== Number(user?.branch_id) &&
          Number(item.quantity_in_stock) > 0
      )
      .sort((a, b) => Number(b.quantity_in_stock) - Number(a.quantity_in_stock));
  }, [inventory, selectedRequestItem, user]);

  const salePerformanceData = useMemo(() => {
    const grouped = {};

    branchSales.forEach((sale) => {
      const date = sale.sale_date
        ? new Date(sale.sale_date).toLocaleDateString("en-MY", {
          month: "short",
          day: "numeric",
        })
        : "Unknown";

      if (!grouped[date]) {
        grouped[date] = {
          revenue: 0,
          quantity: 0,
        };
      }

      grouped[date].revenue += Number(sale.total_amount || 0);

      saleDetails
        .filter((detail) => Number(detail.sale_id) === Number(sale.sale_id))
        .forEach((detail) => {
          grouped[date].quantity += Number(detail.quantity || 0);
        });
    });

    return Object.keys(grouped).map((date) => ({
      date,
      revenue: grouped[date].revenue,
      quantity: grouped[date].quantity,
    }));
  }, [branchSales, saleDetails]);

  const topProducts = useMemo(() => {
    const saleIds = branchSales.map((sale) => Number(sale.sale_id));
    const grouped = {};

    saleDetails
      .filter((detail) => saleIds.includes(Number(detail.sale_id)))
      .forEach((detail) => {
        const id = detail.product_id;

        if (!grouped[id]) {
          grouped[id] = {
            product_id: id,
            product_name: detail.product_name,
            quantity: 0,
            revenue: 0,
          };
        }

        grouped[id].quantity += Number(detail.quantity || 0);
        grouped[id].revenue += Number(detail.subtotal || 0);
      });

    return Object.values(grouped)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, topProductsLimit);
  }, [saleDetails, branchSales, topProductsLimit]);

  const totalSales = branchSales.reduce(
    (sum, sale) => sum + Number(sale.total_amount || 0),
    0
  );

  const totalStock = branchInventory.reduce(
    (sum, item) => sum + Number(item.quantity_in_stock || 0),
    0
  );

  const hasPendingTransferRequest = (productId) => {
    return stockTransfers.some(
      (transfer) =>
        Number(transfer.to_branch_id) === Number(user?.branch_id) &&
        ["PENDING", "PENDING_SOURCE", "APPROVED"].includes(transfer.status) &&
        Array.isArray(transfer.product_ids) &&
        transfer.product_ids.some((id) => Number(id) === Number(productId))
    );
  };


  const openRequestModal = (item) => {
    setSelectedRequestItem(item);
    setRequestQuantity("");
    setSourceBranchId("");
    setShowRequestModal(true);
  };

  const submitStockRequest = async () => {
    if (!selectedRequestItem) return;

    if (!sourceBranchId) {
      alert("Please select source branch.");
      return;
    }

    if (!requestQuantity || Number(requestQuantity) <= 0) {
      alert("Please enter valid quantity.");
      return;
    }

    try {
      setRequestLoading(true);

      const transferRes = await fetch(`${API_BASE}/staff/stock-transfer/request`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_branch_id: Number(sourceBranchId),
          to_branch_id: Number(user.branch_id),
          requested_by: Number(user.user_id),
          items: [{
            product_id: Number(selectedRequestItem.product_id),
            quantity: Number(requestQuantity),
          }],
        }),
      });

      const transferData = await transferRes.json();

      if (!transferRes.ok) {
        throw new Error(transferData.message || "Failed to create transfer request.");
      }

      setShowRequestModal(false);
      setSelectedRequestItem(null);
      setRequestQuantity("");
      setSourceBranchId("");

      fetchAnalyticsData(user);
      
      setToast({
        show: true,
        message: "Stock request submitted successfully",
      });

      setTimeout(() => {
        setToast({ show: false, message: "" });
      }, 2500);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setRequestLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#eef6fb] text-[#6f85a3]">
        <div className="text-center">
          <Package size={42} className="mx-auto mb-3" />
          <p className="font-semibold">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-screen w-full overflow-hidden ${eyeCareMode
          ? "bg-[#f4f1ea] text-[#3b3b3b]"
          : "bg-[#eef6fb] text-[#17325c]"
        }`}
    >
      <div
        className={`grid h-full transition-all duration-300 ${sidebarOpen
            ? "grid-cols-[230px_minmax(0,1fr)]"
            : "grid-cols-[86px_minmax(0,1fr)]"
          }`}
      >
        {/* SIDEBAR */}
        <aside
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`flex flex-col bg-[#d9edf8] py-6 border-r border-blue-100 transition-all duration-300 ${sidebarOpen ? "px-5" : "px-3"
            }`}
        >
          <div
            className={`mb-8 flex items-center ${!sidebarOpen ? "justify-center" : "justify-between"
              }`}
          >
            {!!sidebarOpen && (
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

          {!!sidebarOpen && (
            <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
              <h4 className="font-extrabold text-[#16325b]">
                {user?.branch_name || "Main Branch"}
              </h4>
              <p className="mt-1 text-xs text-[#6f85a3]">
                Staff ID: {user?.user_id}
              </p>
            </div>
          )}

          <nav className="space-y-3">
            <button
              onClick={() => navigate("/staff")}
              className={`flex w-full items-center rounded-2xl bg-white/30 py-4 font-semibold text-[#254e7a] hover:bg-white/70 ${!sidebarOpen ? "justify-center px-0" : "gap-4 px-4"
                }`}
            >
              <ShoppingCart size={18} />
              {!!sidebarOpen && <span>POS Terminal</span>}
            </button>

            <button
              className={`flex w-full items-center rounded-2xl bg-white py-4 font-bold text-[#1e4db7] shadow ${!sidebarOpen ? "justify-center px-0" : "gap-4 px-4"
                }`}
            >
              <BarChart3 size={18} />
              {!!sidebarOpen && <span>Analytics</span>}
            </button>

            <button
              onClick={() => navigate("/staff", { state: { openSalesHistory: true } })}
              className={`flex w-full items-center rounded-2xl bg-white/30 py-4 font-semibold text-[#254e7a] transition-all duration-300 hover:-translate-y-1 hover:bg-white/70 hover:shadow-lg ${!sidebarOpen ? "justify-center px-0" : "gap-4 px-4"
                }`}
            >
              <History size={18} />
              {!!sidebarOpen && <span>Sales History</span>}
            </button>

          </nav>

        </aside>

        {/* MAIN */}
        <motion.main
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
        className="min-w-0 overflow-y-auto px-8 py-6"
        >
          <header className="mb-8 flex items-center gap-5">
            <div>
              <h1 className="text-3xl font-extrabold text-[#07102f]">
                Branch Analytics
              </h1>
              <p className="mt-1 text-sm text-[#6f85a3]">
                Sales performance, stock status, branch staff and top products.
              </p>
            </div>

            {/*Dropdowns*/ }
            <div className="relative ml-auto flex items-center gap-3">
            <button
                onClick={() => setShowNotifications(true)}
                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
            >
                <Bell size={18} />
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
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
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

          {showLowStockPanel && (
            <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
                <div>
                <h2 className="text-xl font-extrabold text-[#07102f]">
                    Low Stock Alert
                </h2>
                <p className="mt-1 text-sm text-[#6f85a3]">
                    Products that have reached or fallen below reorder level.
                </p>
                </div>

                <span className="rounded-full bg-red-100 px-4 py-2 text-sm font-bold text-red-600">
                {lowStockItems.length} item(s)
                </span>
            </div>

            {lowStockItems.length === 0 ? (
                <div className="rounded-xl bg-[#f4fbff] p-5 text-sm font-semibold text-[#6f85a3]">
                No low stock products at this branch.
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-4">
                {lowStockItems.map((item) => (
                    <div
                    key={`${item.product_id}-${item.branch_id}`}
                    className="rounded-xl border border-red-100 bg-red-50 p-4"
                    >
                    <h3 className="font-extrabold text-[#17325c]">
                        {item.product_name}
                    </h3>

                    <p className="mt-1 text-xs text-[#6f85a3]">
                        SKU: {item.product_code}
                    </p>

                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-red-600">
                        Stock: {item.quantity_in_stock}
                        </span>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-600">
                        Reorder: {item.reorder_level}
                        </span>
                    </div>

                    {hasPendingTransferRequest(item.product_id) ? (
                      <button
                        disabled
                        className="mt-4 w-full rounded-full bg-gray-300 py-3 text-sm font-extrabold text-gray-600"
                      >
                        Requested / Pending Approval
                      </button>
                    ) : (
                      <button
                        onClick={() => openRequestModal(item)}
                        className="mt-4 w-full rounded-full bg-[#0c2f73] py-3 text-sm font-extrabold text-white hover:bg-[#173f8a]"
                      >
                        Request Stock
                      </button>
                    )}

                    </div>
                ))}
                </div>
            )}
            </section>
          )}

          {/* SUMMARY CARDS */}
         <section className="mb-6 grid grid-cols-5 gap-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                  Branch Sales
                </p>
                <TrendingUp className="text-orange-600" size={22} />
              </div>
              <h2 className="mt-4 text-3xl font-extrabold">
                {formatCurrency(totalSales)}
              </h2>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                  Total Stock
                </p>
                <Boxes className="text-[#1e4db7]" size={22} />
              </div>
              <h2 className="mt-4 text-3xl font-extrabold">{totalStock}</h2>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                Low Stock
                </p>
                <Package className="text-red-500" size={22} />
            </div>
            <h2 className="mt-4 text-3xl font-extrabold text-red-500">
                {lowStockItems.length}
            </h2>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                  Branch Team
                </p>
                <Users className="text-[#1e4db7]" size={22} />
              </div>
              <h2 className="mt-4 text-3xl font-extrabold">
                {branchStaff.length}
              </h2>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                  Top Seller
                </p>
                <Trophy className="text-orange-600" size={22} />
              </div>
              <h2 className="mt-4 truncate text-xl font-extrabold">
                {topProducts[0]?.product_name || "No sales yet"}
              </h2>
            </div>
          </section>

          {/* CHARTS */}
          <section className="mb-6 grid grid-cols-[1.4fr_1fr] gap-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-extrabold">
                Branch Sales Performance
              </h2>

              <div className="h-[310px]">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "BAR" ? (
                    <BarChart data={salePerformanceData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey={displayMode === "REVENUE" ? "revenue" : "quantity"}
                        fill="#0c2f73"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <LineChart data={salePerformanceData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey={displayMode === "REVENUE" ? "revenue" : "quantity"}
                        stroke="#0c2f73"
                        strokeWidth={3}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {showTopProductsPanel && (
              <div className="rounded-2xl bg-[#0c2f73] p-6 text-white shadow-sm">
              <h2 className="mb-5 text-xl font-extrabold">
                Top Seller Products
              </h2>

              <div className="space-y-4">
                {topProducts.length === 0 ? (
                  <p className="text-blue-100">No sale details found.</p>
                ) : (
                  topProducts.map((item, index) => (
                    <div
                      key={item.product_id}
                      className="rounded-xl bg-white/10 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold">
                            #{index + 1} {item.product_name}
                          </p>
                          <p className="mt-1 text-xs text-blue-200">
                            Sold: {item.quantity} units
                          </p>
                        </div>

                        <p className="font-extrabold text-orange-300">
                          {formatCurrency(item.revenue)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            )}
          </section>

          {/* STOCK + STAFF */}
          <section className="grid grid-cols-[1.3fr_1fr] gap-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-extrabold">Stock Bar Chart</h2>

              <div className="h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stockChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="stock" fill="#9edff5" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-extrabold">
                Staff at This Branch
              </h2>

              <div className="space-y-3">
                {branchStaff.map((staff) => (
                  <div
                    key={staff.user_id}
                    className="flex items-center justify-between rounded-xl bg-[#f4fbff] p-4"
                  >
                    <div>
                      <p className="font-bold">{staff.name}</p>
                      <p className="text-xs text-[#6f85a3]">{staff.email}</p>
                    </div>

                    <span className="rounded-full bg-[#dcf0f9] px-3 py-1 text-xs font-bold text-[#1f4e77]">
                      {formatPosition(staff.role)}
                    </span>
                  </div>
                ))}

                {branchStaff.length === 0 && (
                  <p className="text-sm text-[#6f85a3]">
                    No staff found for this branch.
                  </p>
                )}
              </div>
            </div>
          </section>
        </motion.main>
     
    </div>

    {/* Low stock request modal */}
      {showRequestModal && selectedRequestItem && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[480px] rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#07102f]">
                Request Stock
              </h2>

              <button
                onClick={() => setShowRequestModal(false)}
                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 text-sm text-[#17325c]">
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-bold uppercase text-red-500">
                  Low Stock Product
                </p>
                <h3 className="mt-1 text-lg font-extrabold">
                  {selectedRequestItem.product_name}
                </h3>
                <p className="mt-1 text-xs text-[#6f85a3]">
                  Current Stock: {selectedRequestItem.quantity_in_stock} | Reorder Level:{" "}
                  {selectedRequestItem.reorder_level}
                </p>
              </div>

              <div>
                <label className="mb-2 block font-extrabold">Source Branch</label>
                <select
                  value={sourceBranchId}
                  onChange={(e) => setSourceBranchId(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
                >
                  <option value="">Select available branch</option>
                  {availableSourceBranches.map((branch) => (
                    <option
                      key={`${branch.product_id}-${branch.branch_id}`}
                      value={branch.branch_id}
                    >
                      {branch.branch_name} — Stock: {branch.quantity_in_stock}
                    </option>
                  ))}
                </select>

                {availableSourceBranches.length === 0 && (
                  <p className="mt-2 text-xs font-bold text-red-500">
                    No other branch has available stock for this product.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block font-extrabold">Request Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={requestQuantity}
                  onChange={(e) => setRequestQuantity(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
                  placeholder="Enter quantity"
                />
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowRequestModal(false)}
                className="rounded-full border border-[#0c2f73] bg-white py-4 font-extrabold text-[#0c2f73]"
              >
                Cancel
              </button>

              <button
                onClick={submitStockRequest}
                disabled={requestLoading || availableSourceBranches.length === 0}
                className="rounded-full bg-[#0c2f73] py-4 font-extrabold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {requestLoading ? "Submitting..." : "Submit Request"}
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

            <div className="space-y-5 text-sm text-[#17325c]">
                <div>
                <h3 className="mb-2 font-extrabold">Quick Help</h3>
                <p>• View branch sales performance</p>
                <p>• Check low stock products</p>
                <p>• Review top seller products</p>
                </div>

                <div className="border-t pt-4">
                <h3 className="mb-2 font-extrabold">Contact Support</h3>
                <p>WhatsApp: 017-7032568</p>
                <p>Email: support@retailpulse.com</p>
                </div>

                <div className="rounded-2xl bg-[#eef6fb] p-4">
                <h3 className="mb-1 font-extrabold">System Status</h3>
                <p className="font-bold text-green-600">● Active</p>
                </div>
            </div>
            </div>
        </div>
        )} 

      {toast.show && (
        <div className="fixed top-6 left-1/2 z-[1000] -translate-x-1/2 pointer-events-none">
          <div className="flex items-center gap-3 bg-green-600 text-white px-6 py-4 rounded-xl shadow-xl">
            <CheckCircle size={18} />
            {toast.message}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[460px] rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#07102f]">
                Analytics Settings
              </h2>

              <button
                onClick={() => setShowSettings(false)}
                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 text-sm text-[#17325c]">
              <div>
                <label className="mb-2 block font-extrabold">Chart Type</label>
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
                >
                  <option value="BAR">Bar Chart</option>
                  <option value="LINE">Line Chart</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block font-extrabold">Display Mode</label>
                <select
                  value={displayMode}
                  onChange={(e) => setDisplayMode(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
                >
                  <option value="REVENUE">Revenue</option>
                  <option value="QUANTITY">Quantity Sold</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block font-extrabold">Top Products Limit</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={topProductsLimit}
                  onChange={(e) => setTopProductsLimit(Number(e.target.value))}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#eef6fb] p-4">
                <div>
                  <p className="font-extrabold">Show Low Stock Alert</p>
                  <p className="text-xs text-[#6f84a1]">Display low stock panel</p>
                </div>

                <button
                  onClick={() => setShowLowStockPanel(!showLowStockPanel)}
                  className={`relative h-7 w-14 rounded-full transition ${showLowStockPanel ? "bg-green-500" : "bg-gray-300"
                    }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${showLowStockPanel ? "right-1" : "left-1"
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#eef6fb] p-4">
                <div>
                  <p className="font-extrabold">Show Top Products</p>
                  <p className="text-xs text-[#6f84a1]">Display top seller panel</p>
                </div>

                <button
                  onClick={() => setShowTopProductsPanel(!showTopProductsPanel)}
                  className={`relative h-7 w-14 rounded-full transition ${showTopProductsPanel ? "bg-green-500" : "bg-gray-300"
                    }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${showTopProductsPanel ? "right-1" : "left-1"
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#eef6fb] p-4">
                <div>
                  <p className="font-extrabold">Eye Care Mode</p>
                  <p className="text-xs text-[#6f84a1]">
                    Reduce eye strain with softer colors
                  </p>
                </div>

                <button
                  onClick={() => setEyeCareMode(!eyeCareMode)}
                  className={`relative h-7 w-14 rounded-full transition ${eyeCareMode ? "bg-green-500" : "bg-gray-300"
                    }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${eyeCareMode ? "right-1" : "left-1"
                      }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-full border border-[#0c2f73] bg-white py-4 font-extrabold text-[#0c2f73]"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  sessionStorage.setItem("analyticsChartType", chartType);
                  sessionStorage.setItem("analyticsDisplayMode", displayMode);
                  sessionStorage.setItem("analyticsTopProductsLimit", topProductsLimit);
                  sessionStorage.setItem("analyticsShowLowStockPanel", showLowStockPanel);
                  sessionStorage.setItem("analyticsShowTopProductsPanel", showTopProductsPanel);
                  sessionStorage.setItem("eyeCareMode", eyeCareMode);

                  setShowSettings(false);
                  setToast({
                    show: true,
                    message: "Analytics settings saved successfully",
                  });

                  setTimeout(() => {
                    setToast({ show: false, message: "" });
                  }, 2500);
                }}
                className="rounded-full bg-[#0c2f73] py-4 font-extrabold text-white"
              >
                Save Settings
              </button>
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
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="font-extrabold text-red-600">
                  Low Stock Alert
                </p>
                <p className="mt-1 text-sm text-[#6f84a1]">
                  {lowStockItems.length} product(s) are below reorder level.
                </p>
              </div>

              <div className="rounded-2xl bg-[#eef6fb] p-4">
                <p className="font-extrabold text-[#17325c]">
                  Branch Analytics Active
                </p>
                <p className="mt-1 text-sm text-[#6f84a1]">
                  Sales and inventory report loaded successfully.
                </p>
              </div>

              <div className="rounded-2xl bg-[#eef6fb] p-4">
                <p className="font-extrabold text-[#17325c]">
                  Reminder
                </p>
                <p className="mt-1 text-sm text-[#6f84a1]">
                  Review low stock items before closing shift.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPosition(role) {
  const labels = {
    INVENTORY_MANAGER: "Inventory Manager",
    BRANCH_STAFF: "Branch Staff",
  };

  return labels[role] || String(role || "-").replace(/_/g, " ");
}

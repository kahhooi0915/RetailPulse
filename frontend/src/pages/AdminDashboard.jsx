import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CircleDollarSign,
  FileDown,
  FolderKanban,
  HelpCircle,
  Package,
  Printer,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import DashboardLayout from "../layouts/DashboardLayout";
import { downloadPDF } from "../utils/downloadPDF";
import { formatCurrency } from "../utils/formatCurrency";

const API_BASE = "http://localhost:5000";

const getDashboardPeriodQuery = (view) => {
  const period = String(view || "Monthly").toLowerCase();
  if (period.includes("year")) return "period=yearly";
  return "period=monthly";
};

const GROSS_PROFIT_TOOLTIP =
  "Gross Profit represents the estimated profit generated from product sales before operating expenses. It is calculated using the difference between selling price and purchase cost multiplied by quantity sold.";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState({
    pending_transfers: 0,
    total_sales: 0,
    gross_profit: 0,
    inventory_value: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);
  const [settingsData] = useState(() => {
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

  const [notificationRead, setNotificationRead] = useState(() => {
    return sessionStorage.getItem("adminNotificationRead") === "true";
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
        dashboardSummaryRes,
        recentActivityRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/admin/users`),
        fetch(`${API_BASE}/admin/branches`),
        fetch(`${API_BASE}/admin/products`),
        fetch(`${API_BASE}/admin/categories`),
        fetch(`${API_BASE}/admin/inventory`),
        fetch(`${API_BASE}/admin/sales`),
        fetch(`${API_BASE}/admin/dashboard/summary?${getDashboardPeriodQuery(settingsData.dashboardView)}`),
        fetch(`${API_BASE}/admin/audit-logs?user_id=${user.user_id}&limit=5`),
      ]);

      const usersData = await usersRes.json();
      const branchesData = await branchesRes.json();
      const productsData = await productsRes.json();
      const categoriesData = await categoriesRes.json();
      const inventoryData = await inventoryRes.json();
      const salesData = await salesRes.json();
      const dashboardSummaryData = await dashboardSummaryRes.json();
      const recentActivityData = await recentActivityRes.json();

      setUsers(Array.isArray(usersData) ? usersData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
      setSales(Array.isArray(salesData) ? salesData : []);
      setDashboardSummary(dashboardSummaryData || {
        pending_transfers: 0,
        total_sales: 0,
        gross_profit: 0,
        inventory_value: 0,
      });
      setRecentActivity(Array.isArray(recentActivityData) ? recentActivityData : []);
    } catch (error) {
      console.error(error);
      alert("Failed to load admin dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => loadData();

  const generatedDateTime = new Date().toLocaleString();

  const generatedDateForFile = () => {
    const generatedDate = new Date();
    const year = generatedDate.getFullYear();
    const month = String(generatedDate.getMonth() + 1).padStart(2, "0");
    const day = String(generatedDate.getDate()).padStart(2, "0");
    const hours = String(generatedDate.getHours()).padStart(2, "0");
    const minutes = String(generatedDate.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}`;
  };

  const handlePrintDashboard = () => {
    window.print();
  };

  const handleExportSummaryPdf = async () => {
    try {
      setIsPdfGenerating(true);
      document.body.classList.add("exporting-admin-dashboard");
      await new Promise((resolve) => setTimeout(resolve, 150));
      await downloadPDF({
        elementId: "admin-dashboard-report-content",
        fileName: `RetailPulse_Admin_Dashboard_${generatedDateForFile()}.pdf`,
      });
    } finally {
      document.body.classList.remove("exporting-admin-dashboard");
      setIsPdfGenerating(false);
    }
  };

  const totalSales = Number(dashboardSummary.total_sales || 0);
  const grossProfit = Number(dashboardSummary.gross_profit || 0);
  const inventoryValue = Number(dashboardSummary.inventory_value || 0);

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
      sessionStorage.getItem("adminLowStockCount") || 0
    );

    if (lowStockItems.length !== previousCount) {
      setNotificationRead(false);
      sessionStorage.setItem("adminNotificationRead", "false");
      sessionStorage.setItem("adminLowStockCount", String(lowStockItems.length));
    }
  }, [lowStockItems.length]);

  const salesBranches = useMemo(() => {
    return branches.filter((branch) => branch.branch_type === "BRANCH");
  }, [branches]);

  const branchPerformance = useMemo(() => {
    return salesBranches.map((branch) => {
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
  }, [salesBranches, sales]);

  const branchesWithSales = branchPerformance.filter(
    (branch) => Number(branch.revenue || 0) > 0 || Number(branch.transactions || 0) > 0
  );

  const top5Branches = [...branchesWithSales]
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5);

  const branchSalesPieData = top5Branches.map((branch) => ({
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
    <>
      <style>
        {`
          .admin-dashboard-report-cover {
            display: none;
          }

          .exporting-admin-dashboard .admin-dashboard-report-cover {
            display: block;
          }

          .exporting-admin-dashboard .admin-dashboard-actions {
            display: none !important;
          }

          .exporting-admin-dashboard #admin-dashboard-report-content {
            background: #eef6fb;
            padding: 24px;
          }

          @media print {
            @page {
              size: A4;
              margin: 10mm;
            }

            html,
            body,
            #root {
              height: auto !important;
              overflow: visible !important;
              background: #eef6fb !important;
            }

            body * {
              visibility: hidden !important;
            }

            #admin-dashboard-report-content,
            #admin-dashboard-report-content * {
              visibility: visible !important;
            }

            #admin-dashboard-report-content {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              box-sizing: border-box !important;
              background: #eef6fb !important;
              color: #07102f !important;
              padding: 18px !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .admin-dashboard-report-cover {
              display: none !important;
            }

            .admin-dashboard-print-header {
              display: block !important;
            }

            .admin-dashboard-actions,
            aside,
            nav {
              display: none !important;
            }

            #admin-dashboard-report-content section,
            #admin-dashboard-report-content .report-panel {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            #admin-dashboard-report-content .shadow-sm,
            #admin-dashboard-report-content .shadow-xl {
              box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08) !important;
            }

            #admin-dashboard-report-content .rounded-2xl {
              border-radius: 16px !important;
            }

            #admin-dashboard-report-content .admin-dashboard-chart-card,
            #admin-dashboard-report-content .admin-dashboard-chart {
              max-width: 100% !important;
              overflow: hidden !important;
            }

            #admin-dashboard-report-content .admin-dashboard-screen-chart {
              display: none !important;
            }

            #admin-dashboard-report-content .admin-dashboard-print-chart {
              display: block !important;
            }

            #admin-dashboard-report-content .admin-dashboard-print-chart.hidden {
              display: block !important;
            }

            #admin-dashboard-report-content .recharts-responsive-container,
            #admin-dashboard-report-content .recharts-wrapper,
            #admin-dashboard-report-content .recharts-surface {
              max-width: 100% !important;
            }

            #admin-dashboard-report-content .recharts-surface {
              overflow: hidden !important;
            }

            #admin-dashboard-report-content .bg-white {
              background-color: #ffffff !important;
            }

            #admin-dashboard-report-content .bg-\\[\\#eef6fb\\] {
              background-color: #eef6fb !important;
            }

            #admin-dashboard-report-content .bg-\\[\\#f8fcff\\] {
              background-color: #f8fcff !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid {
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              gap: 14px !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid > div {
              padding: 16px !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid h2 {
              font-size: 18px !important;
              line-height: 1.25 !important;
            }

            #admin-dashboard-report-content .admin-dashboard-summary-grid p {
              letter-spacing: 0.04em !important;
            }

            #admin-dashboard-report-content table {
              font-size: 11px !important;
            }
          }
        `}
      </style>

      <DashboardLayout
        user={user}
        title="Admin Dashboard"
        subtitle="Monitor users, branches, products, inventory, sales, and system performance."
        modelText={`Current View: ${settingsData.dashboardView}`}
        onRefresh={refreshData}
        onOpenNotifications={() => {
          setShowNotifications(true);
          setNotificationRead(true);
          sessionStorage.setItem("adminNotificationRead", "true");
        }}
        notificationCount={notificationCount}
        compactMode={settingsData.compactMode}
        headerActions={
          <div className="admin-dashboard-actions flex flex-wrap items-center justify-end gap-2">
            <DashboardActionButton
              icon={Printer}
              label="Print Dashboard"
              onClick={handlePrintDashboard}
            />
            <DashboardActionButton
              icon={FileDown}
              label={isPdfGenerating ? "Generating PDF..." : "Download as PDF"}
              onClick={handleExportSummaryPdf}
              disabled={isPdfGenerating || loading}
              primary
            />
          </div>
        }
      >
        <div
          id="admin-dashboard-report-content"
          className="admin-dashboard-report-content"
        >
          <div className="admin-dashboard-print-header mb-6 hidden">
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
          <div className="admin-dashboard-report-cover rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-[#1e4db7]">
              RetailPulse
            </p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#07102f]">
              Admin Dashboard Summary
            </h2>
            <p className="mt-1 text-sm text-[#6f85a3]">
              Management snapshot for users, branches, products, inventory, sales,
              and system operations.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-[#17325c]">
              <span>Generated: {generatedDateTime}</span>
              <span>Current View: {settingsData.dashboardView}</span>
            </div>
          </div>
          <div className={settingsData.compactMode ? "space-y-5" : "space-y-6"}>
        {loading ? (
          <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
            <div className="text-center">
              <BarChart3 size={42} className="mx-auto mb-3" />
              <p className="font-semibold">Loading admin dashboard data...</p>
            </div>
          </div>
        ) : (
          <>
            <section className="admin-dashboard-summary-grid grid grid-cols-2 gap-5 xl:grid-cols-4">
              <SummaryCard title="Total Users" value={users.length} icon={Users} color="text-[#1e4db7]" />
              <SummaryCard title="Branches" value={branches.length} icon={Building2} color="text-[#1e4db7]" />
              <SummaryCard title="Products" value={products.length} icon={Package} color="text-green-600" />
              <SummaryCard title="Categories" value={categories.length} icon={FolderKanban} color="text-[#07102f]" />
            </section>

            <section className="admin-dashboard-summary-grid grid grid-cols-2 gap-5 xl:grid-cols-3 2xl:grid-cols-6">
              <SummaryCard title="Total Sales" value={formatCurrency(totalSales)} icon={TrendingUp} color="text-green-600" />
              <SummaryCard
                title="Gross Profit"
                value={formatCurrency(grossProfit)}
                icon={CircleDollarSign}
                color="text-green-600"
                tooltipText={GROSS_PROFIT_TOOLTIP}
              />
              <SummaryCard title="Inventory Value" value={formatCurrency(inventoryValue)} icon={Package} color="text-[#1e4db7]" />
              <SummaryCard title="Sales Records" value={sales.length} icon={ShoppingCart} color="text-[#1e4db7]" />
              <SummaryCard
                title="Pending Transfers"
                value={dashboardSummary.pending_transfers || 0}
                icon={ArrowLeftRight}
                color="text-orange-600"
                helperText="Awaiting approval or processing"
              />
              <SummaryCard title="Low Stock Items" value={lowStockItems.length} icon={AlertTriangle} color="text-orange-600" />
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="admin-dashboard-chart-card rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-extrabold text-[#07102f]">
                  Top Performing Sales Branches
                </h2>
                <p className="mt-1 text-sm text-[#6f85a3]">
                  Top 5 sales branches with the highest revenue.
                </p>

                <BranchRevenueBarChart
                  branches={top5Branches}
                  formatCurrency={formatCurrency}
                  barColor="#1e4db7"
                />
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

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="admin-dashboard-chart-card rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-extrabold text-[#07102f]">
                  Top 5 Sales Distribution by Branch
                </h2>
                <p className="mt-1 text-sm text-[#6f85a3]">
                  Visual breakdown of total sales revenue for the top five performing branches.
                </p>

                <div className="admin-dashboard-chart mt-6">
                  {branchSalesPieData.length > 0 ? (
                    <>
                      <div className="admin-dashboard-screen-chart h-[300px]">
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
                      </div>
                      <PrintDistributionChart
                        data={branchSalesPieData}
                        colors={pieColors}
                        formatValue={formatCurrency}
                      />
                    </>
                  ) : (
                    <EmptyBox text="No branch sales data available for chart." />
                  )}
                </div>
              </div>

              <div className="admin-dashboard-chart-card rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-extrabold text-[#07102f]">
                  Inventory Status Overview
                </h2>
                <p className="mt-1 text-sm text-[#6f85a3]">
                  Comparison between low stock and normal stock items.
                </p>

                <div className="admin-dashboard-chart mt-6">
                  <div className="admin-dashboard-screen-chart h-[300px]">
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
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          <Cell fill="#ef4444" />
                          <Cell fill="#1e4db7" />
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <PrintDistributionChart
                    data={[
                      { name: "Low Stock", value: lowStockItems.length },
                      {
                        name: "Normal Stock",
                        value: Math.max(inventory.length - lowStockItems.length, 0),
                      },
                    ]}
                    colors={["#ef4444", "#1e4db7"]}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                Recent Activity
              </h2>

              <div className="overflow-hidden rounded-2xl border border-blue-50">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Description</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentActivity.map((item) => (
                      <tr key={item.audit_id} className="border-t">
                        <td className="px-4 py-4 font-semibold">
                          {formatDateTime(item.created_at)}
                        </td>
                        <td className="px-4 py-4 font-bold">{item.user_name}</td>
                        <td className="px-4 py-4 font-bold text-[#1e4db7]">{item.action}</td>
                        <td className="px-4 py-4 text-[#4c6280]">
                          {shortText(item.description)}
                        </td>
                      </tr>
                    ))}

                    {recentActivity.length === 0 && (
                      <tr>
                        <td
                          colSpan="4"
                          className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                        >
                          No recent activity found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                  Top Stock Products
                </h2>

                <div className="space-y-3">
                  {topProducts.map((item) => (
                    <div
                      key={item.product_id}
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
                        {item.quantity}
                      </span>
                    </div>
                  ))}

                  {topProducts.length === 0 && (
                    <EmptyBox text="No product stock data found." />
                  )}
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
                        <tr
                          key={`${item.product_id}-${item.branch_id}`}
                          className="border-t"
                        >
                          <td className="px-4 py-4 font-bold">
                            {item.product_name}
                          </td>
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
                          <td
                            colSpan="3"
                            className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                          >
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
                        <td className="px-4 py-4 font-bold">
                          {sale.sale_code}
                        </td>
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
                        <td
                          colSpan="5"
                          className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                        >
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
          </div>
        </div>

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
                title="Low Stock Alert"
                desc={`${lowStockItems.length} item(s) need attention.`}
                color="orange"
              />
              <NotificationCard
                title="Sales Records"
                desc={`${sales.length} total sale record(s) found.`}
                color="blue"
              />
              <NotificationCard
                title="System Users"
                desc={`${users.length} user account(s) registered.`}
                color="green"
              />
            </div>
          </div>
        </div>
      )}
      </DashboardLayout>
    </>
  );
}

function DashboardActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  primary = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:translate-y-0 disabled:bg-gray-200 disabled:text-gray-500 sm:text-sm ${
        primary
          ? "bg-[#0c2f73] text-white hover:bg-[#103986]"
          : "border border-blue-100 bg-white text-[#17325c] hover:border-[#1e4db7] hover:bg-[#f8fcff] hover:text-[#1e4db7]"
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function SummaryCard({ title, value, icon: Icon, color, helperText, tooltipText }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
            {title}
          </p>
          {tooltipText && (
            <span className="group relative inline-flex">
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full text-[#6f85a3] transition hover:bg-[#eef6fb] hover:text-[#1e4db7]"
                aria-label={tooltipText}
              >
                <HelpCircle size={14} />
              </button>
              <span className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-lg border border-blue-100 bg-white p-3 text-left text-xs font-semibold normal-case tracking-normal text-[#17325c] shadow-xl group-hover:block">
                {tooltipText}
              </span>
            </span>
          )}
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef6fb]">
          <Icon size={18} className={color} />
        </div>
      </div>

      <h2 className={`mt-4 text-2xl font-extrabold ${color}`}>{value}</h2>
      {helperText && (
        <p className="mt-1 text-xs font-semibold text-[#6f85a3]">
          {helperText}
        </p>
      )}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function shortText(value) {
  if (!value) return "-";
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
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

function BranchRevenueBarChart({ branches, formatCurrency, barColor }) {
  if (branches.length === 0) {
    return <EmptyBox text="No sales data available." />;
  }

  const maxRevenue = Math.max(
    ...branches.map((branch) => Number(branch.revenue || 0)),
    1
  );

  return (
    <div className="admin-dashboard-chart mt-6">
      <div className="admin-dashboard-screen-chart h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={branches}
            layout="vertical"
            margin={{ top: 8, right: 28, left: 18, bottom: 8 }}
          >
            <CartesianGrid stroke="#eef6fb" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value) => formatCurrency(value)}
              tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="branch_name"
              width={170}
              tick={{ fill: "#17325c", fontSize: 12, fontWeight: 800 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "#f8fcff" }}
              content={<BranchRevenueTooltip formatCurrency={formatCurrency} />}
            />
            <Bar dataKey="revenue" fill={barColor} radius={[0, 8, 8, 0]} barSize={24}>
              <LabelList
                dataKey="revenue"
                position="right"
                formatter={(value) => formatCurrency(value)}
                fill="#17325c"
                fontSize={12}
                fontWeight={800}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-dashboard-print-chart hidden space-y-4">
        {branches.map((branch) => {
          const revenue = Number(branch.revenue || 0);
          const width = `${Math.max((revenue / maxRevenue) * 100, 2)}%`;

          return (
            <div key={branch.branch_id}>
              <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                <span className="max-w-[55%] font-extrabold text-[#17325c]">
                  {branch.branch_name}
                </span>
                <span className="font-bold text-[#6f85a3]">
                  {formatCurrency(revenue)}
                </span>
              </div>
              <div className="h-5 overflow-hidden rounded-full bg-[#eef6fb]">
                <div
                  className="h-full rounded-full"
                  style={{ width, backgroundColor: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchRevenueTooltip({ active, payload, formatCurrency }) {
  if (!active || !payload?.length) return null;

  const branch = payload[0].payload;

  return (
    <div className="rounded-2xl border border-blue-50 bg-white p-4 text-sm shadow-xl">
      <p className="font-extrabold text-[#07102f]">{branch.branch_name}</p>
      <p className="mt-1 text-xs font-bold text-[#6f85a3]">
        {branch.branch_code || "-"}
      </p>
      <p className="mt-3 font-extrabold text-[#1e4db7]">
        {formatCurrency(branch.revenue)}
      </p>
    </div>
  );
}

function PrintDistributionChart({ data, colors, formatValue = (value) => value }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <div className="admin-dashboard-print-chart hidden">
      <div className="mb-5 flex h-8 overflow-hidden rounded-full bg-[#eef6fb]">
        {data.map((item, index) => {
          const value = Number(item.value || 0);
          const width = total > 0 ? `${(value / total) * 100}%` : "0%";

          return (
            <div
              key={item.name}
              className="h-full"
              style={{
                width,
                backgroundColor: colors[index % colors.length],
              }}
            />
          );
        })}
      </div>

      <div className="space-y-3">
        {data.map((item, index) => {
          const value = Number(item.value || 0);
          const percent = total > 0 ? (value / total) * 100 : 0;

          return (
            <div
              key={item.name}
              className="flex items-center justify-between gap-4 rounded-xl bg-[#f8fcff] px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <span className="truncate font-extrabold text-[#17325c]">
                  {item.name}
                </span>
              </div>
              <span className="shrink-0 font-bold text-[#6f85a3]">
                {formatValue(value)} ({percent.toFixed(0)}%)
              </span>
            </div>
          );
        })}
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

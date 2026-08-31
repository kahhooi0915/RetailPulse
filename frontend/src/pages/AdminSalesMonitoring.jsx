import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, HelpCircle, LineChart as LineChartIcon, Printer } from "lucide-react";
import html2canvas from "html2canvas";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import DashboardLayout from "../layouts/DashboardLayout";
import { formatCurrency } from "../utils/formatCurrency";

const API = "http://localhost:5000";
const PROFIT_MARGIN_TOOLTIP =
    "Profit Margin is calculated as Gross Profit divided by Total Revenue, multiplied by 100. Gross Profit uses each sale item's unit price minus the latest purchase cost, multiplied by quantity sold.";

export default function SalesMonitoring() {
    const user = JSON.parse(sessionStorage.getItem("user")) || {};
    const chartsRef = useRef(null);
    const [sales, setSales] = useState([]);
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [branchFilter, setBranchFilter] = useState("ALL");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [salesMetric, setSalesMetric] = useState("REVENUE");
    const [selectedProduct, setSelectedProduct] = useState("ALL");

    const fetchData = async () => {
        try {
            setLoading(true);

            const [salesRes, detailsRes] = await Promise.all([
                fetch(`${API}/admin/sales`, { credentials: "include" }),
                fetch(`${API}/admin/sale-details`, { credentials: "include" }),
            ]);

            const salesData = await salesRes.json();
            const detailsData = await detailsRes.json();

            setSales(Array.isArray(salesData) ? salesData : []);
            setDetails(Array.isArray(detailsData) ? detailsData : []);
        } catch (err) {
            console.error("Sales monitoring error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = window.setTimeout(fetchData, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const branches = useMemo(() => {
        return ["ALL", ...new Set(sales.map((s) => s.branch_name).filter(Boolean))];
    }, [sales]);

    const filteredSales = useMemo(() => {
        return sales.filter((sale) => {
            const matchBranch =
                branchFilter === "ALL" || sale.branch_name === branchFilter;
            const matchDate = isSaleWithinDateRange(sale.sale_date, startDate, endDate);

            const keyword = search.toLowerCase();
            const matchSearch =
                sale.sale_code?.toLowerCase().includes(keyword) ||
                sale.user_name?.toLowerCase().includes(keyword) ||
                sale.branch_name?.toLowerCase().includes(keyword) ||
                sale.payment_method?.toLowerCase().includes(keyword);

            return matchBranch && matchDate && matchSearch;
        });
    }, [sales, search, branchFilter, startDate, endDate]);

    const dateRangeLabel = useMemo(() => {
        if (startDate && endDate) return `${startDate} to ${endDate}`;
        if (startDate) return `From ${startDate}`;
        if (endDate) return `Until ${endDate}`;
        return "All Dates";
    }, [startDate, endDate]);

    const totalRevenue = filteredSales.reduce(
        (sum, sale) => sum + Number(sale.total_amount || 0),
        0
    );

    const totalTransactions = filteredSales.length;

    const avgTransaction =
        totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const todaySales = filteredSales.filter((sale) => {
        const saleDate = new Date(sale.sale_date).toDateString();
        const today = new Date().toDateString();
        return saleDate === today;
    });

    const todayRevenue = todaySales.reduce(
        (sum, sale) => sum + Number(sale.total_amount || 0),
        0
    );

    const filteredSaleIds = useMemo(() => {
        return new Set(filteredSales.map((sale) => Number(sale.sale_id)));
    }, [filteredSales]);

    const filteredSalesById = useMemo(() => {
        const map = {};
        filteredSales.forEach((sale) => {
            map[Number(sale.sale_id)] = sale;
        });
        return map;
    }, [filteredSales]);

    const filteredDetails = useMemo(() => {
        return details.filter((item) => filteredSaleIds.has(Number(item.sale_id)));
    }, [details, filteredSaleIds]);

    const productSold = filteredDetails.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
    );

    const grossProfit = filteredDetails.reduce(
        (sum, item) => sum + Number(item.gross_profit || 0),
        0
    );

    const profitMargin =
        totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const branchSummary = useMemo(() => {
        const map = {};

        filteredSales.forEach((sale) => {
            const branch = sale.branch_name || "Unknown Branch";

            if (!map[branch]) {
                map[branch] = {
                    branch,
                    transactions: 0,
                    revenue: 0,
                    quantity: 0,
                };
            }

            map[branch].transactions += 1;
            map[branch].revenue += Number(sale.total_amount || 0);
        });

        filteredDetails.forEach((item) => {
            const sale = filteredSalesById[Number(item.sale_id)];
            const branch = sale?.branch_name || "Unknown Branch";

            if (!map[branch]) {
                map[branch] = {
                    branch,
                    transactions: 0,
                    revenue: 0,
                    quantity: 0,
                };
            }

            map[branch].quantity += Number(item.quantity || 0);
        });

        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [filteredSales, filteredDetails, filteredSalesById]);

    const paymentSummary = useMemo(() => {
        const map = {};

        filteredSales.forEach((sale) => {
            const method = sale.payment_method || "Unknown";

            if (!map[method]) {
                map[method] = {
                    method,
                    count: 0,
                    revenue: 0,
                };
            }

            map[method].count += 1;
            map[method].revenue += Number(sale.total_amount || 0);
        });

        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [filteredSales]);

    const topProducts = useMemo(() => {
        const map = {};

        filteredDetails.forEach((item) => {
            const name = item.product_name || "Unknown Product";

            if (!map[name]) {
                map[name] = {
                    product_name: name,
                    quantity: 0,
                    revenue: 0,
                };
            }

            map[name].quantity += Number(item.quantity || 0);
            map[name].revenue += Number(item.subtotal || 0);
        });

        return Object.values(map)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);
    }, [filteredDetails]);

    const productComparison = useMemo(() => {
        const map = {};

        filteredDetails.forEach((item) => {
            const name = item.product_name || "Unknown Product";

            if (!map[name]) {
                map[name] = {
                    product_name: name,
                    quantity: 0,
                    revenue: 0,
                };
            }

            map[name].quantity += Number(item.quantity || 0);
            map[name].revenue += Number(item.subtotal || 0);
        });

        return Object.values(map)
            .sort((a, b) => {
                const first = salesMetric === "REVENUE" ? b.revenue - a.revenue : b.quantity - a.quantity;
                return first || b.revenue - a.revenue;
            })
            .slice(0, 8);
    }, [filteredDetails, salesMetric]);

    const productOptions = useMemo(() => {
        return Object.values(
            filteredDetails.reduce((map, item) => {
                const key = item.product_name || "Unknown Product";
                map[key] = key;
                return map;
            }, {})
        ).sort((a, b) => a.localeCompare(b));
    }, [filteredDetails]);

    const salesTrend = useMemo(() => {
        const map = {};

        filteredSales.forEach((sale) => {
            const date = sale.sale_date ? new Date(sale.sale_date) : null;
            if (!date || Number.isNaN(date.getTime())) return;

            const key = formatMonthKey(date);
            if (!map[key]) {
                map[key] = {
                    key,
                    label: formatMonthLabel(date),
                    revenue: 0,
                    quantity: 0,
                    transactions: 0,
                };
            }

            map[key].revenue += Number(sale.total_amount || 0);
            map[key].transactions += 1;
        });

        filteredDetails.forEach((item) => {
            const sale = filteredSalesById[Number(item.sale_id)];
            const date = sale?.sale_date ? new Date(sale.sale_date) : null;
            if (!date || Number.isNaN(date.getTime())) return;

            const key = formatMonthKey(date);
            if (!map[key]) {
                map[key] = {
                    key,
                    label: formatMonthLabel(date),
                    revenue: 0,
                    quantity: 0,
                    transactions: 0,
                };
            }

            map[key].quantity += Number(item.quantity || 0);
        });

        return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredSales, filteredDetails, filteredSalesById]);

    const selectedProductTrend = useMemo(() => {
        const map = {};

        filteredDetails.forEach((item) => {
            const productName = item.product_name || "Unknown Product";
            if (selectedProduct !== "ALL" && productName !== selectedProduct) return;

            const sale = filteredSalesById[Number(item.sale_id)];
            const date = sale?.sale_date ? new Date(sale.sale_date) : null;
            if (!date || Number.isNaN(date.getTime())) return;

            const key = formatMonthKey(date);
            if (!map[key]) {
                map[key] = {
                    key,
                    label: formatMonthLabel(date),
                    revenue: 0,
                    quantity: 0,
                };
            }

            map[key].revenue += Number(item.subtotal || 0);
            map[key].quantity += Number(item.quantity || 0);
        });

        return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredDetails, filteredSalesById, selectedProduct]);

    const productProfitReport = useMemo(() => {
        const map = {};

        filteredDetails.forEach((item) => {
            const productId = item.product_id || item.product_code || item.product_name;
            const quantity = Number(item.quantity || 0);
            const revenue = Number(item.subtotal || 0);
            const estimatedCost = Number(item.purchase_cost || 0) * quantity;
            const grossProfitValue = Number(item.gross_profit || 0);

            if (!map[productId]) {
                map[productId] = {
                    product_id: productId,
                    product_code: item.product_code || "-",
                    product_name: item.product_name || "Unknown Product",
                    quantity: 0,
                    revenue: 0,
                    estimatedCost: 0,
                    grossProfit: 0,
                };
            }

            map[productId].quantity += quantity;
            map[productId].revenue += revenue;
            map[productId].estimatedCost += estimatedCost;
            map[productId].grossProfit += grossProfitValue;
        });

        return Object.values(map).sort((a, b) => b.grossProfit - a.grossProfit);
    }, [filteredDetails]);

    const handleDownloadExcel = async () => {
        const generatedAt = new Date();
        let chartImageDataUrl = "";

        if (chartsRef.current) {
            try {
                const canvas = await html2canvas(chartsRef.current, {
                    backgroundColor: "#f4f8fb",
                    scale: 2,
                    useCORS: true,
                });
                chartImageDataUrl = canvas.toDataURL("image/png");
            } catch (err) {
                console.error("Sales chart capture error:", err);
            }
        }

        const workbookBlob = buildSalesMonitoringWorkbookBlob({
            generatedAt: generatedAt.toLocaleString(),
            branchFilter,
            startDate,
            endDate,
            search,
            salesMetric,
            selectedProduct,
            chartImageDataUrl,
            totalRevenue,
            totalTransactions,
            productSold,
            grossProfit,
            profitMargin,
            avgTransaction,
            todayRevenue,
            filteredSales,
            productProfitReport,
            branchSummary,
            paymentSummary,
            topProducts,
            salesTrend,
            selectedProductTrend,
            productComparison,
        });
        const url = URL.createObjectURL(workbookBlob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `RetailPulse_Sales_Monitoring_${formatDateForFile(generatedAt)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handlePrintReport = () => {
        window.print();
    };

    return (
        <>
            <style>
                {`
                    @media print {
                        @page {
                            size: A4;
                            margin: 12mm;
                        }

                        html,
                        body,
                        #root {
                            height: auto !important;
                            overflow: visible !important;
                            background: #ffffff !important;
                        }

                        body * {
                            visibility: hidden !important;
                        }

                        .sales-report-print-area,
                        .sales-report-print-area * {
                            visibility: visible !important;
                        }

                        .sales-report-print-area {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 100% !important;
                            background: #ffffff !important;
                            color: #07102f !important;
                        }

                        .no-print {
                            display: none !important;
                        }

                        .sales-report-print-area > *,
                        .sales-report-print-area table {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }

                        .sales-report-print-area .shadow,
                        .sales-report-print-area .shadow-sm {
                            box-shadow: none !important;
                        }
                    }
                `}
            </style>

            <DashboardLayout
                user={user}
                title="Sales Monitoring"
                subtitle="Monitor sales performance, transactions, branches, and top-selling products."
                onRefresh={fetchData}
                headerActions={
                    <div className="no-print flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={handlePrintReport}
                            disabled={loading}
                            className="flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-[#0c2f73] shadow transition hover:bg-[#eef6fb] disabled:cursor-not-allowed disabled:opacity-60"
                            title="Print the filtered sales report"
                        >
                            <Printer size={16} />
                            Print Report
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadExcel}
                            disabled={loading}
                            className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#0c2f73] px-5 text-sm font-extrabold text-white shadow transition hover:bg-[#103986] disabled:cursor-not-allowed disabled:opacity-60"
                            title="Download sales reporting page data and charts as Excel"
                        >
                            <Download size={16} />
                            Download Excel
                        </button>
                    </div>
                }
            >
            <div className="sales-report-print-area space-y-6">
                <div className="hidden rounded-2xl bg-white p-5 print:block">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#1e4db7]">
                        RetailPulse
                    </p>
                    <h2 className="mt-2 text-2xl font-extrabold text-[#07102f]">
                        Sales Report
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                        Branch: {branchFilter === "ALL" ? "All Branches" : branchFilter}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                        Date Range: {dateRangeLabel}
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
                    <SummaryCard title="Total Revenue" value={formatCurrency(totalRevenue)} />
                    <SummaryCard title="Transactions" value={totalTransactions} />
                    <SummaryCard title="Product Sold" value={productSold} />
                    <SummaryCard
                        title="Profit Margin"
                        value={`${profitMargin.toFixed(2)}%`}
                        tooltip={PROFIT_MARGIN_TOOLTIP}
                    />
                    <SummaryCard title="Average Sale" value={formatCurrency(avgTransaction)} />
                    <SummaryCard title="Today Revenue" value={formatCurrency(todayRevenue)} />
                </div>

                <div ref={chartsRef} className="space-y-6 rounded-3xl bg-[#f4f8fb] p-1">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
                        <ChartPanel
                            title="Sales Trend"
                            subtitle="Monthly revenue, units sold, and transaction movement."
                            icon={LineChartIcon}
                            action={
                                <MetricToggle value={salesMetric} onChange={setSalesMetric} />
                            }
                        >
                            <div className="h-[320px]">
                                {salesTrend.length === 0 ? (
                                    <EmptyChart />
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                            data={salesTrend}
                                            margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
                                        >
                                            <CartesianGrid stroke="#e8f1fb" vertical={false} />
                                            <XAxis
                                                dataKey="label"
                                                tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                yAxisId="sales"
                                                tickFormatter={(value) =>
                                                    salesMetric === "REVENUE" ? compactCurrency(value) : value
                                                }
                                                tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                yAxisId="transactions"
                                                orientation="right"
                                                tick={{ fill: "#f59e0b", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: "#b7cbe8", strokeWidth: 1 }}
                                                formatter={(value, name) => formatChartValue(value, name)}
                                                labelStyle={{ color: "#07102f", fontWeight: 800 }}
                                            />
                                            <Line
                                                yAxisId="sales"
                                                type="monotone"
                                                dataKey={salesMetric === "REVENUE" ? "revenue" : "quantity"}
                                                name={salesMetric === "REVENUE" ? "Revenue" : "Units Sold"}
                                                stroke="#0c2f73"
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: "#0c2f73", strokeWidth: 0 }}
                                                activeDot={{ r: 6 }}
                                            />
                                            <Line
                                                yAxisId="transactions"
                                                type="monotone"
                                                dataKey="transactions"
                                                name="Transactions"
                                                stroke="#f59e0b"
                                                strokeWidth={2}
                                                dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </ChartPanel>

                        <ChartPanel
                            title="Product Trend"
                            subtitle="Inspect one product or all product movement over time."
                            icon={LineChartIcon}
                            action={
                                <select
                                    value={selectedProduct}
                                    onChange={(e) => setSelectedProduct(e.target.value)}
                                    className="h-10 max-w-[220px] rounded-lg border border-blue-100 bg-white px-3 text-sm font-bold text-[#17325c] outline-none focus:border-[#1e4db7]"
                                >
                                    <option value="ALL">All Products</option>
                                    {productOptions.map((productName) => (
                                        <option key={productName} value={productName}>
                                            {productName}
                                        </option>
                                    ))}
                                </select>
                            }
                        >
                            <div className="h-[320px]">
                                {selectedProductTrend.length === 0 ? (
                                    <EmptyChart />
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                            data={selectedProductTrend}
                                            margin={{ top: 12, right: 18, left: 0, bottom: 8 }}
                                        >
                                            <CartesianGrid stroke="#e8f1fb" vertical={false} />
                                            <XAxis
                                                dataKey="label"
                                                tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tickFormatter={(value) =>
                                                    salesMetric === "REVENUE" ? compactCurrency(value) : value
                                                }
                                                tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: "#b7cbe8", strokeWidth: 1 }}
                                                formatter={(value, name) => formatChartValue(value, name)}
                                                labelStyle={{ color: "#07102f", fontWeight: 800 }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey={salesMetric === "REVENUE" ? "revenue" : "quantity"}
                                                name={salesMetric === "REVENUE" ? "Revenue" : "Units Sold"}
                                                stroke="#16a34a"
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: "#16a34a", strokeWidth: 0 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </ChartPanel>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <ChartPanel
                            title="Product Sales Comparison"
                            subtitle="Top products ranked by selected sales metric."
                            icon={BarChart3}
                            action={<MetricToggle value={salesMetric} onChange={setSalesMetric} />}
                        >
                            <div className="h-[360px]">
                                {productComparison.length === 0 ? (
                                    <EmptyChart />
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={productComparison}
                                            layout="vertical"
                                            margin={{ top: 8, right: 28, left: 18, bottom: 8 }}
                                        >
                                            <CartesianGrid stroke="#e8f1fb" horizontal={false} />
                                            <XAxis
                                                type="number"
                                                tickFormatter={(value) =>
                                                    salesMetric === "REVENUE" ? compactCurrency(value) : value
                                                }
                                                tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="product_name"
                                                width={150}
                                                tick={{ fill: "#17325c", fontSize: 12, fontWeight: 800 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: "#f8fcff" }}
                                                formatter={(value, name) => formatChartValue(value, name)}
                                                labelStyle={{ color: "#07102f", fontWeight: 800 }}
                                            />
                                            <Bar
                                                dataKey={salesMetric === "REVENUE" ? "revenue" : "quantity"}
                                                name={salesMetric === "REVENUE" ? "Revenue" : "Units Sold"}
                                                fill="#1e4db7"
                                                radius={[0, 8, 8, 0]}
                                                barSize={22}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </ChartPanel>

                        <ChartPanel
                            title="Branch Sales Comparison"
                            subtitle="Revenue and volume comparison between branches."
                            icon={BarChart3}
                            action={<MetricToggle value={salesMetric} onChange={setSalesMetric} />}
                        >
                            <div className="h-[360px]">
                                {branchSummary.length === 0 ? (
                                    <EmptyChart />
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={branchSummary}
                                            margin={{ top: 12, right: 18, left: 4, bottom: 36 }}
                                        >
                                            <CartesianGrid stroke="#e8f1fb" vertical={false} />
                                            <XAxis
                                                dataKey="branch"
                                                tick={{ fill: "#17325c", fontSize: 11, fontWeight: 800 }}
                                                axisLine={false}
                                                tickLine={false}
                                                interval={0}
                                                angle={-12}
                                                textAnchor="end"
                                            />
                                            <YAxis
                                                tickFormatter={(value) =>
                                                    salesMetric === "REVENUE" ? compactCurrency(value) : value
                                                }
                                                tick={{ fill: "#6f85a3", fontSize: 12, fontWeight: 700 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: "#f8fcff" }}
                                                formatter={(value, name) => formatChartValue(value, name)}
                                                labelStyle={{ color: "#07102f", fontWeight: 800 }}
                                            />
                                            <Bar
                                                dataKey={salesMetric === "REVENUE" ? "revenue" : "quantity"}
                                                name={salesMetric === "REVENUE" ? "Revenue" : "Units Sold"}
                                                fill="#0f766e"
                                                radius={[8, 8, 0, 0]}
                                                barSize={44}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </ChartPanel>
                    </div>
                </div>

                <div className="rounded-3xl bg-white p-5 shadow">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Sales Records
                            </h2>
                            <p className="text-sm text-[#6f85a3]">
                                Search and filter sales transactions.
                            </p>
                        </div>

                        <div className="no-print grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search sale code, staff, branch..."
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm outline-none focus:border-[#1e4db7]"
                            />

                            <select
                                value={branchFilter}
                                onChange={(e) => setBranchFilter(e.target.value)}
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm outline-none focus:border-[#1e4db7]"
                            >
                                {branches.map((branch) => (
                                    <option key={branch} value={branch}>
                                        {branch === "ALL" ? "All Branches" : branch}
                                    </option>
                                ))}
                            </select>

                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm font-semibold text-[#17325c] outline-none focus:border-[#1e4db7]"
                                title="Start date"
                            />

                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm font-semibold text-[#17325c] outline-none focus:border-[#1e4db7]"
                                title="End date"
                            />

                            <button
                                type="button"
                                onClick={() => {
                                    setSearch("");
                                    setBranchFilter("ALL");
                                    setStartDate("");
                                    setEndDate("");
                                }}
                                className="rounded-2xl border border-blue-100 px-4 py-3 text-sm font-extrabold text-[#17325c] transition hover:border-[#1e4db7] hover:bg-[#eef6fb]"
                            >
                                Clear Filters
                            </button>
                        </div>
                    </div>

                    <div className="mt-5 max-h-[430px] overflow-auto pr-1">
                        <table className="w-full min-w-[850px] text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="py-3">Sale Code</th>
                                    <th>Branch</th>
                                    <th>Staff</th>
                                    <th>Date</th>
                                    <th>Payment</th>
                                    <th className="text-right">Amount</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            Loading sales data...
                                        </td>
                                    </tr>
                                ) : filteredSales.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            No sales records found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSales.map((sale) => (
                                        <tr key={sale.sale_id} className="border-b last:border-none">
                                            <td className="py-4 font-bold text-[#1e4db7]">
                                                {sale.sale_code}
                                            </td>
                                            <td>{sale.branch_name}</td>
                                            <td>{sale.user_name}</td>
                                            <td>
                                                {sale.sale_date
                                                    ? new Date(sale.sale_date).toLocaleString()
                                                    : "-"}
                                            </td>
                                            <td>
                                                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#1e4db7]">
                                                    {sale.payment_method}
                                                </span>
                                            </td>
                                            <td className="text-right font-extrabold">
                                                {formatCurrency(sale.total_amount)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-3xl bg-white p-5 shadow">
                    <div>
                        <h2 className="text-xl font-extrabold text-[#07102f]">
                            Product Profit Report
                        </h2>
                        <p className="text-sm text-[#6f85a3]">
                            Gross profit by product based on sales revenue and estimated purchase cost.
                        </p>
                    </div>

                    <div className="mt-5 max-h-[430px] overflow-auto pr-1">
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="py-3">Product</th>
                                    <th className="text-right">Units Sold</th>
                                    <th className="text-right">Revenue</th>
                                    <th className="text-right">Estimated Cost</th>
                                    <th className="text-right">Gross Profit</th>
                                    <th className="text-right">Margin</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            Loading product profit data...
                                        </td>
                                    </tr>
                                ) : productProfitReport.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-8 text-center text-[#6f85a3]">
                                            No product profit data found.
                                        </td>
                                    </tr>
                                ) : (
                                    productProfitReport.map((product) => {
                                        const margin =
                                            product.revenue > 0
                                                ? (product.grossProfit / product.revenue) * 100
                                                : 0;

                                        return (
                                            <tr key={product.product_id} className="border-b last:border-none">
                                                <td className="py-4">
                                                    <p className="font-extrabold text-[#17325c]">
                                                        {product.product_name}
                                                    </p>
                                                    <p className="text-xs font-semibold text-[#6f85a3]">
                                                        {product.product_code}
                                                    </p>
                                                </td>
                                                <td className="text-right font-bold text-[#17325c]">
                                                    {product.quantity}
                                                </td>
                                                <td className="text-right font-bold text-[#17325c]">
                                                    {formatCurrency(product.revenue)}
                                                </td>
                                                <td className="text-right font-bold text-[#17325c]">
                                                    {formatCurrency(product.estimatedCost)}
                                                </td>
                                                <td className="text-right font-extrabold text-green-600">
                                                    {formatCurrency(product.grossProfit)}
                                                </td>
                                                <td className="text-right font-extrabold text-[#1e4db7]">
                                                    {margin.toFixed(2)}%
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <InfoPanel title="Branch Sales Performance">
                        {branchSummary.length === 0 ? (
                            <EmptyText />
                        ) : (
                            branchSummary.map((branch) => (
                                <ProgressRow
                                    key={branch.branch}
                                    label={branch.branch}
                                    value={formatCurrency(branch.revenue)}
                                    percent={
                                        totalRevenue > 0
                                            ? (branch.revenue / totalRevenue) * 100
                                            : 0
                                    }
                                />
                            ))
                        )}
                    </InfoPanel>

                    <InfoPanel title="Payment Method Summary">
                        {paymentSummary.length === 0 ? (
                            <EmptyText />
                        ) : (
                            paymentSummary.map((item) => (
                                <ProgressRow
                                    key={item.method}
                                    label={item.method}
                                    value={formatCurrency(item.revenue)}
                                    percent={
                                        totalRevenue > 0
                                            ? (item.revenue / totalRevenue) * 100
                                            : 0
                                    }
                                />
                            ))
                        )}
                    </InfoPanel>

                    <InfoPanel title="Top Selling Products">
                        {topProducts.length === 0 ? (
                            <EmptyText />
                        ) : (
                            topProducts.map((product) => (
                                <div
                                    key={product.product_name}
                                    className="mb-4 rounded-2xl bg-[#eef6fb] p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-extrabold text-[#17325c]">
                                                {product.product_name}
                                            </p>
                                            <p className="text-xs text-[#6f85a3]">
                                                Sold Quantity: {product.quantity}
                                            </p>
                                        </div>

                                        <p className="font-extrabold text-[#1e4db7]">
                                            {formatCurrency(product.revenue)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </InfoPanel>
                </div>
            </div>
            </DashboardLayout>
        </>
    );
}

function ChartPanel({ title, subtitle, icon: Icon, action, children }) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                    {Icon && (
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#eef6fb] text-[#1e4db7]">
                            <Icon size={20} />
                        </div>
                    )}
                    <div>
                        <h2 className="text-lg font-extrabold text-[#07102f]">
                            {title}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                            {subtitle}
                        </p>
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {children}
        </div>
    );
}

function MetricToggle({ value, onChange }) {
    return (
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-blue-100 bg-[#f8fcff] p-1">
            {[
                ["REVENUE", "Revenue"],
                ["QUANTITY", "Units"],
            ].map(([option, label]) => (
                <button
                    key={option}
                    type="button"
                    onClick={() => onChange(option)}
                    className={`h-8 px-3 text-xs font-extrabold transition ${
                        value === option
                            ? "rounded-md bg-[#0c2f73] text-white shadow-sm"
                            : "text-[#6f85a3] hover:text-[#1e4db7]"
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function EmptyChart() {
    return (
        <div className="grid h-full min-h-[240px] place-items-center rounded-lg bg-[#f8fcff] p-6 text-center">
            <p className="text-sm font-bold text-[#6f85a3]">
                No chart data available.
            </p>
        </div>
    );
}

function SummaryCard({ title, value, tooltip }) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-[#6f85a3]">{title}</p>
                {tooltip && (
                    <span className="group relative inline-flex">
                        <button
                            type="button"
                            className="grid h-5 w-5 place-items-center rounded-full text-[#6f85a3] transition hover:bg-[#eef6fb] hover:text-[#1e4db7]"
                            aria-label={tooltip}
                        >
                            <HelpCircle size={14} />
                        </button>
                        <span className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-lg border border-blue-100 bg-white p-3 text-left text-xs font-semibold text-[#17325c] shadow-xl group-hover:block">
                            {tooltip}
                        </span>
                    </span>
                )}
            </div>
            <h3 className="mt-3 text-2xl font-extrabold text-[#07102f]">
                {value}
            </h3>
        </div>
    );
}

function InfoPanel({ title, children }) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <h2 className="mb-5 text-lg font-extrabold text-[#07102f]">
                {title}
            </h2>
            {children}
        </div>
    );
}

function ProgressRow({ label, value, percent }) {
    return (
        <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-bold text-[#17325c]">{label}</p>
                <p className="text-sm font-extrabold text-[#1e4db7]">{value}</p>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-[#e4eef7]">
                <div
                    className="h-full rounded-full bg-[#1e4db7]"
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
        </div>
    );
}

function EmptyText() {
    return (
        <p className="rounded-2xl bg-[#eef6fb] p-4 text-sm font-semibold text-[#6f85a3]">
            No data available.
        </p>
    );
}

function formatMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date) {
    return date.toLocaleDateString("en-MY", {
        month: "short",
        year: "2-digit",
    });
}

function compactCurrency(value) {
    const amount = Number(value || 0);
    if (Math.abs(amount) >= 1000) {
        return `RM${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
    }
    return `RM${amount.toFixed(0)}`;
}

function formatChartValue(value, name) {
    const label = name === "revenue" || name === "Revenue" ? "Revenue" : name;
    const formattedValue = label === "Revenue" ? formatCurrency(value) : Number(value || 0);
    return [formattedValue, label];
}

function isSaleWithinDateRange(saleDateValue, startDate, endDate) {
    if (!startDate && !endDate) return true;
    if (!saleDateValue) return false;

    const saleDate = new Date(saleDateValue);
    if (Number.isNaN(saleDate.getTime())) return false;

    if (startDate) {
        const start = new Date(`${startDate}T00:00:00`);
        if (saleDate < start) return false;
    }

    if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999`);
        if (saleDate > end) return false;
    }

    return true;
}

function buildSalesMonitoringWorkbookBlob({
    generatedAt,
    branchFilter,
    startDate,
    endDate,
    search,
    salesMetric,
    selectedProduct,
    chartImageDataUrl,
    totalRevenue,
    totalTransactions,
    productSold,
    grossProfit,
    profitMargin,
    avgTransaction,
    todayRevenue,
    filteredSales,
    productProfitReport,
    branchSummary,
    paymentSummary,
    topProducts,
    salesTrend,
    selectedProductTrend,
    productComparison,
}) {
    const chartImageBytes = chartImageDataUrl
        ? dataUrlToUint8Array(chartImageDataUrl)
        : null;

    const summaryRows = [
        [textCell("RetailPulse Sales Monitoring Report", "Title", 1)],
        [textCell("Generated At", "SummaryLabel"), textCell(generatedAt)],
        [textCell("Branch Filter", "SummaryLabel"), textCell(branchFilter === "ALL" ? "All Branches" : branchFilter)],
        [textCell("Start Date", "SummaryLabel"), textCell(startDate || "-")],
        [textCell("End Date", "SummaryLabel"), textCell(endDate || "-")],
        [textCell("Search Filter", "SummaryLabel"), textCell(search || "-")],
        [textCell("Chart Metric", "SummaryLabel"), textCell(salesMetric === "REVENUE" ? "Revenue" : "Units Sold")],
        [textCell("Product Trend Filter", "SummaryLabel"), textCell(selectedProduct === "ALL" ? "All Products" : selectedProduct)],
        [],
        [textCell("Metric", "Header"), textCell("Value", "Header")],
        [textCell("Total Revenue", "SummaryLabel"), numberCell(totalRevenue, "Currency")],
        [textCell("Transactions", "SummaryLabel"), numberCell(totalTransactions)],
        [textCell("Product Sold", "SummaryLabel"), numberCell(productSold)],
        [textCell("Gross Profit", "SummaryLabel"), numberCell(grossProfit, "Currency")],
        [textCell("Profit Margin", "SummaryLabel"), numberCell(profitMargin / 100, "Percent")],
        [textCell("Average Sale", "SummaryLabel"), numberCell(avgTransaction, "Currency")],
        [textCell("Today Revenue", "SummaryLabel"), numberCell(todayRevenue, "Currency")],
    ];

    const chartRows = [
        [textCell("RetailPulse Sales Monitoring Charts", "Title", 7)],
        [textCell("Generated At", "SummaryLabel"), textCell(generatedAt, "Text", 6)],
        [textCell("Current Metric", "SummaryLabel"), textCell(salesMetric === "REVENUE" ? "Revenue" : "Units Sold", "Text", 6)],
        [textCell("Product Trend Filter", "SummaryLabel"), textCell(selectedProduct === "ALL" ? "All Products" : selectedProduct, "Text", 6)],
        [],
        [textCell(chartImageBytes ? "Chart image is embedded below." : "Chart image could not be captured. Use the chart-data sheets in this workbook.", "Text", 7)],
    ];

    const salesTrendRows = [
        headerRow(["Month", "Revenue (RM)", "Units Sold", "Transactions"]),
        ...salesTrend.map((row) => [
            textCell(row.label || "-"),
            numberCell(row.revenue, "Currency"),
            numberCell(row.quantity),
            numberCell(row.transactions),
        ]),
    ];

    const productTrendRows = [
        headerRow(["Month", "Revenue (RM)", "Units Sold"]),
        ...selectedProductTrend.map((row) => [
            textCell(row.label || "-"),
            numberCell(row.revenue, "Currency"),
            numberCell(row.quantity),
        ]),
    ];

    const productComparisonRows = [
        headerRow(["Product", "Revenue (RM)", "Units Sold"]),
        ...productComparison.map((product) => [
            textCell(product.product_name || "-"),
            numberCell(product.revenue, "Currency"),
            numberCell(product.quantity),
        ]),
    ];

    const salesRows = [
        headerRow(["Sale Code", "Branch", "Staff", "Date", "Payment", "Amount (RM)"]),
        ...filteredSales.map((sale) => [
            textCell(sale.sale_code || "-"),
            textCell(sale.branch_name || "-"),
            textCell(sale.user_name || "-"),
            textCell(sale.sale_date ? new Date(sale.sale_date).toLocaleString() : "-"),
            textCell(sale.payment_method || "-"),
            numberCell(Number(sale.total_amount || 0), "Currency"),
        ]),
    ];

    const profitRows = [
        headerRow([
            "Product Code",
            "Product Name",
            "Units Sold",
            "Revenue (RM)",
            "Estimated Cost (RM)",
            "Gross Profit (RM)",
            "Margin",
        ]),
        ...productProfitReport.map((product) => [
            textCell(product.product_code || "-"),
            textCell(product.product_name || "-"),
            numberCell(product.quantity),
            numberCell(product.revenue, "Currency"),
            numberCell(product.estimatedCost, "Currency"),
            numberCell(product.grossProfit, "Currency"),
            numberCell(product.revenue > 0 ? product.grossProfit / product.revenue : 0, "Percent"),
        ]),
    ];

    const branchRows = [
        headerRow(["Branch", "Transactions", "Units Sold", "Revenue (RM)", "Revenue Share"]),
        ...branchSummary.map((branch) => [
            textCell(branch.branch || "-"),
            numberCell(branch.transactions),
            numberCell(branch.quantity),
            numberCell(branch.revenue, "Currency"),
            numberCell(totalRevenue > 0 ? branch.revenue / totalRevenue : 0, "Percent"),
        ]),
    ];

    const paymentRows = [
        headerRow(["Payment Method", "Transactions", "Revenue (RM)", "Revenue Share"]),
        ...paymentSummary.map((payment) => [
            textCell(payment.method || "-"),
            numberCell(payment.count),
            numberCell(payment.revenue, "Currency"),
            numberCell(totalRevenue > 0 ? payment.revenue / totalRevenue : 0, "Percent"),
        ]),
    ];

    const topProductRows = [
        headerRow(["Rank", "Product Name", "Units Sold", "Revenue (RM)"]),
        ...topProducts.map((product, index) => [
            numberCell(index + 1),
            textCell(product.product_name || "-"),
            numberCell(product.quantity),
            numberCell(product.revenue, "Currency"),
        ]),
    ];

    const worksheets = [
        { name: "Summary", rows: summaryRows },
        { name: "Charts", rows: chartRows, image: chartImageBytes },
        { name: "Sales Trend Data", rows: salesTrendRows, freezeHeader: true },
        { name: "Product Trend Data", rows: productTrendRows, freezeHeader: true },
        { name: "Product Compare Data", rows: productComparisonRows, freezeHeader: true },
        { name: "Sales Records", rows: salesRows, freezeHeader: true },
        { name: "Product Profit", rows: profitRows, freezeHeader: true },
        { name: "Branch Performance", rows: branchRows, freezeHeader: true },
        { name: "Payment Summary", rows: paymentRows, freezeHeader: true },
        { name: "Top Products", rows: topProductRows, freezeHeader: true },
    ];

    return createXlsxWorkbook(worksheets);
}

function createXlsxWorkbook(sheets) {
    const files = {};
    const chartSheetIndex = sheets.findIndex((sheet) => sheet.image) + 1;

    files["[Content_Types].xml"] = buildXlsxContentTypes(sheets.length, Boolean(chartSheetIndex));
    files["_rels/.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
    files["xl/workbook.xml"] = buildXlsxWorkbookXml(sheets);
    files["xl/_rels/workbook.xml.rels"] = buildXlsxWorkbookRels(sheets.length);
    files["xl/styles.xml"] = buildXlsxStyles();

    sheets.forEach((sheet, index) => {
        const sheetId = index + 1;
        files[`xl/worksheets/sheet${sheetId}.xml`] = buildXlsxWorksheet(sheet, sheetId === chartSheetIndex);
    });

    if (chartSheetIndex) {
        files[`xl/worksheets/_rels/sheet${chartSheetIndex}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
        files["xl/drawings/drawing1.xml"] = buildChartDrawingXml();
        files["xl/drawings/_rels/drawing1.xml.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/charts.png"/>
</Relationships>`;
        files["xl/media/charts.png"] = sheets[chartSheetIndex - 1].image;
    }

    return new Blob([buildZip(files)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

function buildXlsxContentTypes(sheetCount, hasImage) {
    const worksheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${hasImage ? '<Default Extension="png" ContentType="image/png"/>' : ""}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hasImage ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
${worksheetOverrides}
</Types>`;
}

function buildXlsxWorkbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
</sheets>
</workbook>`;
}

function buildXlsxWorkbookRels(sheetCount) {
    const sheetRels = Array.from({ length: sheetCount }, (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ).join("");
    const styleRelId = sheetCount + 1;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
<Relationship Id="rId${styleRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function headerRow(labels) {
    return labels.map((label) => textCell(label, "Header"));
}

function textCell(value, style = "Text", mergeAcross = 0) {
    return {
        type: "text",
        value: value ?? "",
        style,
        mergeAcross,
    };
}

function numberCell(value, style = "Number") {
    return {
        type: "number",
        value: Number.isFinite(Number(value)) ? Number(value) : 0,
        style,
    };
}

function buildXlsxWorksheet(sheet, hasDrawing) {
    const safeRows = sheet.rows.length ? sheet.rows : [[textCell("No data found")]];
    const columnCount = Math.max(...safeRows.map(getRowColumnCount), 1);
    const widths = getColumnWidths(safeRows, columnCount);
    const merges = [];
    const rowXml = safeRows.map((row, rowIndex) => buildXlsxRow(row, rowIndex + 1, merges)).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0">${sheet.freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ""}</sheetView></sheetViews>
<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(10, Math.min(45, width / 7))}" customWidth="1"/>`).join("")}</cols>
<sheetData>${rowXml}</sheetData>
${merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : ""}
${hasDrawing ? '<drawing r:id="rId1"/>' : ""}
</worksheet>`;
}

function buildXlsxRow(row, rowNumber, merges) {
    let columnIndex = 1;
    const cells = row.map((cell) => {
        const ref = `${columnName(columnIndex)}${rowNumber}`;
        const mergeAcross = Number(cell.mergeAcross || 0);

        if (mergeAcross > 0) {
            merges.push(`${ref}:${columnName(columnIndex + mergeAcross)}${rowNumber}`);
        }

        columnIndex += 1 + mergeAcross;
        return buildXlsxCell(cell, ref);
    }).join("");

    return `<row r="${rowNumber}">${cells}</row>`;
}

function buildXlsxCell(cell, ref) {
    const styleId = STYLE_IDS[cell.style] ?? STYLE_IDS.Text;

    if (cell.type === "number") {
        return `<c r="${ref}" s="${styleId}"><v>${Number(cell.value || 0)}</v></c>`;
    }

    return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${xmlEscape(cell.value)}</t></is></c>`;
}

const STYLE_IDS = {
    Text: 0,
    Title: 1,
    Header: 2,
    SummaryLabel: 3,
    Currency: 4,
    Percent: 5,
    Number: 6,
};

function buildXlsxStyles() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="&quot;RM&quot; #,##0.00"/>
<numFmt numFmtId="165" formatCode="0.00%"/>
</numFmts>
<fonts count="4">
<font><sz val="11"/><color rgb="FF17325C"/><name val="Calibri"/></font>
<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF07102F"/><name val="Calibri"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0C2F73"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1E4DB7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF6FB"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFE3ECF7"/></left><right style="thin"><color rgb="FFE3ECF7"/></right><top style="thin"><color rgb="FFE3ECF7"/></top><bottom style="thin"><color rgb="FFE3ECF7"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildChartDrawingXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>34</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="2" name="Sales Monitoring Charts"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:twoCellAnchor>
</xdr:wsDr>`;
}

function getColumnWidths(rows, columnCount) {
    const widths = Array(columnCount).fill(90);

    rows.forEach((row) => {
        let columnIndex = 0;

        row.forEach((cell) => {
            const span = 1 + Number(cell.mergeAcross || 0);
            const valueLength = String(cell.value ?? "").length;
            widths[columnIndex] = Math.max(
                widths[columnIndex],
                Math.min(240, Math.max(70, valueLength * 7 + 24))
            );
            columnIndex += span;
        });
    });

    return widths;
}

function getRowColumnCount(row) {
    return row.reduce((count, cell) => count + 1 + Number(cell.mergeAcross || 0), 0);
}

function columnName(columnNumber) {
    let name = "";
    let current = columnNumber;

    while (current > 0) {
        const remainder = (current - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        current = Math.floor((current - 1) / 26);
    }

    return name;
}

function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function buildZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    Object.entries(files).forEach(([name, content]) => {
        const nameBytes = encoder.encode(name);
        const dataBytes = typeof content === "string" ? encoder.encode(content) : content;
        const crc = crc32(dataBytes);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);

        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, 0, true);
        localView.setUint16(12, 0, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        localParts.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);

        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, 0, true);
        centralView.setUint16(14, 0, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);

        centralParts.push(centralHeader);
        offset += localHeader.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const centralOffset = offset;
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);

    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, centralParts.length, true);
    endView.setUint16(10, centralParts.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, centralOffset, true);
    endView.setUint16(20, 0, true);

    const allParts = [...localParts, ...centralParts, endRecord];
    const totalLength = allParts.reduce((sum, part) => sum + part.length, 0);
    const zipBytes = new Uint8Array(totalLength);
    let position = 0;

    allParts.forEach((part) => {
        zipBytes.set(part, position);
        position += part.length;
    });

    return zipBytes;
}

function crc32(bytes) {
    let crc = 0xffffffff;

    for (let index = 0; index < bytes.length; index += 1) {
        crc ^= bytes[index];
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function formatDateForFile(date) {
    return date.toISOString().slice(0, 10);
}

function xmlEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

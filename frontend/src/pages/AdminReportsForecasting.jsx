import DashboardLayout from "../layouts/DashboardLayout";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BarChart3,
    Bot,
    ChevronRight,
    Package,
    Send,
    TrendingUp,
    X,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

export default function AdminReportsForecasting() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [forecastData, setForecastData] = useState([]);
    const [forecastModel, setForecastModel] = useState("");
    const [products, setProducts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showSettings, setShowSettings] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [showForecastDrawer, setShowForecastDrawer] = useState(false);
    const [chatInput, setChatInput] = useState("");

    const [messages, setMessages] = useState([
        {
            sender: "bot",
            text: "Hi there! I am your RetailPulse Forecast Assistant. I can explain top-selling products, slow-moving products, low stock risks, and next-month sales predictions.",
        },
    ]);

    const chatEndRef = useRef(null);

    useEffect(() => {
        if (showChat) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, showChat]);

    useEffect(() => {
        const savedUser =
            JSON.parse(localStorage.getItem("user")) ||
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

            const [forecastRes, productRes, inventoryRes] = await Promise.all([
                fetch(`${API_BASE}/admin/forecast/products`),
                fetch(`${API_BASE}/admin/products`),
                fetch(`${API_BASE}/admin/inventory`),
            ]);

            const forecastJson = await forecastRes.json();
            const productData = await productRes.json();
            const inventoryData = await inventoryRes.json();

            setForecastData(Array.isArray(forecastJson.forecasts) ? forecastJson.forecasts : []);
            setForecastModel(
                forecastJson.description ||
                "Linear Regression and Prophet comparison using MAE and RMSE"
            );
            setProducts(Array.isArray(productData) ? productData : []);
            setInventory(Array.isArray(inventoryData) ? inventoryData : []);
        } catch (error) {
            console.error(error);
            alert("Failed to load forecasting data. Please check backend API.");
        } finally {
            setLoading(false);
        }
    };

    const topForecastProduct = forecastData[0] || null;

    const totalForecastQuantity = useMemo(() => {
        return forecastData.reduce(
            (sum, item) => sum + Number(item.forecast_quantity || 0),
            0
        );
    }, [forecastData]);

    const totalHistoricalQuantity = useMemo(() => {
        return forecastData.reduce(
            (sum, item) => sum + Number(item.total_quantity || 0),
            0
        );
    }, [forecastData]);

    const averageMae = useMemo(() => {
        const values = forecastData
            .map((item) => Number(item.mae))
            .filter((value) => !Number.isNaN(value));

        if (values.length === 0) return null;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }, [forecastData]);

    const averageRmse = useMemo(() => {
        const values = forecastData
            .map((item) => Number(item.rmse))
            .filter((value) => !Number.isNaN(value));

        if (values.length === 0) return null;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }, [forecastData]);

    const forecastGrowth = useMemo(() => {
        if (!totalHistoricalQuantity) return 0;

        return (
            ((totalForecastQuantity - totalHistoricalQuantity) /
                totalHistoricalQuantity) *
            100
        );
    }, [totalForecastQuantity, totalHistoricalQuantity]);

    const confidenceScore = useMemo(() => {
        if (!averageRmse || !totalForecastQuantity) return null;

        const score = 100 - (averageRmse / Math.max(totalForecastQuantity, 1)) * 100;
        return Math.max(0, Math.min(100, score));
    }, [averageRmse, totalForecastQuantity]);

    const selectedModelSummary = topForecastProduct?.selected_model || "No Data";

    const slowMovingProducts = useMemo(() => {
        return [...forecastData]
            .filter((item) => Number(item.total_quantity || 0) <= 5)
            .sort((a, b) => Number(a.total_quantity || 0) - Number(b.total_quantity || 0))
            .slice(0, 5);
    }, [forecastData]);

    const topSellingProducts = useMemo(() => {
        return [...forecastData]
            .sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0))
            .slice(0, 5);
    }, [forecastData]);

    const lowStockItems = useMemo(() => {
        return inventory.filter((item) => {
            const product = products.find(
                (p) => Number(p.product_id) === Number(item.product_id)
            );
            const reorderLevel = Number(product?.reorder_level || 10);
            return Number(item.quantity_in_stock || 0) <= reorderLevel;
        });
    }, [inventory, products]);

    const suggestedQuestions = [
        "Which product may be the top seller next month?",
        "Why are some products selling poorly?",
        "Which products are slow-moving?",
        "Which products need restocking?",
        "What is the overall sales forecast?",
    ];

    const generateAssistantReply = (question) => {
        const q = question.toLowerCase();

        if (q.includes("top seller") || q.includes("top-selling")) {
            if (!topForecastProduct) {
                return "There is not enough sales data to predict the top-selling product yet.";
            }

            return `${topForecastProduct.product_name} is expected to be the top-selling product next month, with an estimated ${topForecastProduct.forecast_quantity} units sold. This prediction is generated using ${topForecastProduct.selected_model}.`;
        }

        if (q.includes("poor") || q.includes("not selling")) {
            if (slowMovingProducts.length === 0) {
                return "No serious poor-selling products were detected based on the current data.";
            }

            const names = slowMovingProducts.map((p) => p.product_name).join(", ");
            return `The weaker-selling products are ${names}. Possible reasons include low demand, unsuitable pricing, poor visibility, stock availability issues, or weak customer preference.`;
        }

        if (q.includes("slow")) {
            if (slowMovingProducts.length === 0) {
                return "No slow-moving products were found from the current sales data.";
            }

            return `The slow-moving products are ${slowMovingProducts
                .map((p) => `${p.product_name} (${p.total_quantity} units sold)`)
                .join(", ")}. These products may need promotion, price review, or better placement.`;
        }

        if (q.includes("restock") || q.includes("low stock")) {
            if (lowStockItems.length === 0) {
                return "No low-stock items are currently detected.";
            }

            return `${lowStockItems.length} item(s) need restocking. The most critical item is ${lowStockItems[0].product_name} at ${lowStockItems[0].branch_name}, with ${lowStockItems[0].quantity_in_stock} unit(s) left.`;
        }

        if (q.includes("overall") || q.includes("forecast")) {
            if (!topForecastProduct) {
                return "The system needs more historical sales data before producing a meaningful forecast.";
            }

            return `The current forecast indicates that ${topForecastProduct.product_name} has the strongest expected demand next month. Products with low forecast quantities should be reviewed for promotion, pricing, or stock strategy.`;
        }

        return "I can help with top-seller prediction, slow-moving products, poor sales explanation, restocking alerts, and overall sales forecast.";
    };

    const sendMessage = (textFromChip = null) => {
        const text = textFromChip || chatInput.trim();
        if (!text) return;

        const reply = generateAssistantReply(text);

        setMessages((prev) => [
            ...prev,
            { sender: "user", text },
            { sender: "bot", text: reply },
        ]);

        setChatInput("");
    };

   

    return (
        <>
            <DashboardLayout
                user={user}
                title="Reports & Forecasting"
                subtitle="Analyze product sales trends and estimate next-month demand."
                modelText={forecastModel}
                onRefresh={fetchData}
                onOpenSettings={() => setShowSettings(true)}
                onOpenChat={() => setShowChat(true)}
            >

                {loading ? (
                    <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
                        <div className="text-center">
                            <TrendingUp size={42} className="mx-auto mb-3" />
                            <p className="font-semibold">Loading forecasting data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                            <section className="mb-6 rounded-3xl bg-gradient-to-br from-[#07102f] via-[#0c2f73] to-[#1e4db7] p-7 text-white shadow-xl">
                                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.6fr]">
                                    <div>
                                        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-bold uppercase tracking-widest">
                                            <Bot size={15} />
                                            Predictive Forecast Engine
                                        </div>

                                        <h2 className="text-3xl font-extrabold">
                                            Next-Month Sales Prediction
                                        </h2>

                                        <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">
                                            The system compares Linear Regression and Prophet using MAE and RMSE,
                                            then selects the model with the lowest RMSE to generate the final forecast.
                                        </p>

                                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                                            <HeroMetric
                                                label="Predicted Top Seller"
                                                value={topForecastProduct?.product_name || "No Data"}
                                            />

                                            <HeroMetric
                                                label="Total Forecast Units"
                                                value={totalForecastQuantity}
                                            />

                                            <HeroMetric
                                                label="Selected Model"
                                                value={selectedModelSummary}
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-3xl bg-white/12 p-5 backdrop-blur">
                                        <p className="text-sm font-bold text-blue-100">
                                            Forecast Confidence
                                        </p>

                                        <h3 className="mt-3 text-5xl font-extrabold">
                                            {confidenceScore !== null ? `${confidenceScore.toFixed(1)}%` : "-"}
                                        </h3>

                                        <p className="mt-3 text-sm text-blue-100">
                                            Based on average RMSE compared with total forecast quantity.
                                        </p>

                                        <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20">
                                            <div
                                                className="h-full rounded-full bg-white"
                                                style={{
                                                    width: `${confidenceScore !== null ? confidenceScore : 0}%`,
                                                }}
                                            />
                                        </div>

                                        <div className="mt-5 rounded-2xl bg-white/10 p-4">
                                            <p className="text-xs font-bold uppercase tracking-widest text-blue-100">
                                                Forecast Growth
                                            </p>

                                            <p
                                                className={`mt-2 text-2xl font-extrabold ${forecastGrowth >= 0 ? "text-emerald-200" : "text-red-200"
                                                    }`}
                                            >
                                                {forecastGrowth >= 0 ? "+" : ""}
                                                {forecastGrowth.toFixed(1)}%
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-6">
                                <SummaryCard
                                    title="Forecast Top Seller"
                                    value={topForecastProduct?.product_name || "No Data"}
                                    icon={Package}
                                    color="text-[#1e4db7]"
                                />

                                <SummaryCard
                                    title="Forecast Quantity"
                                    value={topForecastProduct?.forecast_quantity || 0}
                                    icon={TrendingUp}
                                    color="text-green-600"
                                />

                                <SummaryCard
                                    title="Selected Model"
                                    value={topForecastProduct?.selected_model || "No Data"}
                                    icon={Bot}
                                    color="text-purple-600"
                                />

                                <SummaryCard
                                    title="Average MAE"
                                    value={averageMae !== null ? averageMae.toFixed(2) : "-"}
                                    icon={BarChart3}
                                    color="text-orange-600"
                                />

                                <SummaryCard
                                    title="Average RMSE"
                                    value={averageRmse !== null ? averageRmse.toFixed(2) : "-"}
                                    icon={BarChart3}
                                    color="text-red-600"
                                />

                                <SummaryCard
                                    title="Low Stock Items"
                                    value={lowStockItems.length}
                                    icon={BarChart3}
                                    color="text-red-600"
                                />
                            </section>

                            <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                                <div className="rounded-2xl bg-white p-6 shadow-sm">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                                Forecast Ranking
                                            </h2>
                                            <p className="mt-1 text-sm text-[#6f85a3]">
                                                Prediction compares Linear Regression and Prophet using MAE and RMSE.
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => setShowForecastDrawer(true)}
                                            className="flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-4 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                        >
                                            View Details
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>

                                    <div className="mt-6 space-y-4">
                                        {forecastData.slice(0, 8).map((item) => {
                                            const maxForecast = Math.max(
                                                ...forecastData.map((p) => Number(p.forecast_quantity || 0)),
                                                1
                                            );
                                            const width = `${(Number(item.forecast_quantity || 0) / maxForecast) * 100}%`;

                                            return (
                                                <div key={item.product_id}>
                                                    <div className="mb-2 flex items-center justify-between text-sm">
                                                        <div className="font-extrabold text-[#17325c]">
                                                            {item.product_name}
                                                        </div>
                                                        <div className="font-bold text-[#6f85a3]">
                                                            {item.forecast_quantity} units
                                                        </div>
                                                    </div>

                                                    <div className="h-3 overflow-hidden rounded-full bg-[#eef6fb]">
                                                        <div
                                                            className="h-full rounded-full bg-[#1e4db7]"
                                                            style={{ width }}
                                                        />
                                                    </div>

                                                    <div className="mt-1 flex items-center justify-between text-xs font-semibold text-[#6f85a3]">
                                                        <span>{item.selected_model || "-"}</span>
                                                        <span>RMSE: {item.rmse ?? "-"}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {forecastData.length === 0 && (
                                            <EmptyBox text="No forecast data available. Check sales history and backend API." />
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl bg-white p-6 shadow-sm">
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        Forecast Assistant Summary
                                    </h2>

                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Business insight generated from forecast and stock data.
                                    </p>

                                    <div className="mt-5 rounded-2xl bg-[#f8fcff] p-5">
                                        <p className="font-bold text-[#17325c]">
                                            {topForecastProduct
                                                ? `${topForecastProduct.product_name} is expected to have the highest demand next month.`
                                                : "More sales data is needed before a forecast can be generated."}
                                        </p>

                                        <p className="mt-3 text-sm leading-6 text-[#6f85a3]">
                                            Selected model:{" "}
                                            <span className="font-bold text-[#1e4db7]">
                                                {topForecastProduct?.selected_model || "-"}
                                            </span>
                                            . The final forecast is generated by the model with the lower RMSE.
                                        </p>
                                    </div>

                                    <div className="mt-5 grid grid-cols-2 gap-3">
                                        <MiniMetric
                                            label="Average MAE"
                                            value={averageMae !== null ? averageMae.toFixed(2) : "-"}
                                        />
                                        <MiniMetric
                                            label="Average RMSE"
                                            value={averageRmse !== null ? averageRmse.toFixed(2) : "-"}
                                        />
                                    </div>

                                    <button
                                        onClick={() => setShowChat(true)}
                                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986]"
                                    >
                                        <Bot size={18} />
                                        Open AI Forecast Assistant
                                    </button>
                                </div>
                            </section>

                            <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                                <ForecastTable title="Top Selling Products" data={topSellingProducts} />
                                <ForecastTable title="Slow Moving Products" data={slowMovingProducts} />
                            </section>
                    </>
                )}
            </DashboardLayout>

            <button
                onClick={() => setShowForecastDrawer(true)}
                className="fixed right-0 top-1/2 z-40 flex h-24 w-11 -translate-y-1/2 items-center justify-center rounded-l-2xl bg-[#0c2f73] text-white shadow-2xl hover:bg-[#103986]"
                title="Open forecast details"
            >
                <ChevronRight size={28} />
            </button>

            <button
                onClick={() => setShowChat(true)}
                className="fixed bottom-7 right-7 z-40 grid h-16 w-16 place-items-center rounded-full bg-[#0c2f73] text-white shadow-2xl hover:bg-[#103986]"
            >
                <Bot size={30} />
            </button>

            {showForecastDrawer && (
                <div className="fixed inset-0 z-50 bg-black/30">
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ duration: 0.3 }}
                        className="absolute right-0 top-0 h-full w-[760px] max-w-[92vw] overflow-y-auto bg-white shadow-2xl"
                    >
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-7 py-5">
                            <div>
                                <h2 className="text-2xl font-extrabold text-[#07102f]">
                                    Forecast Breakdown
                                </h2>
                                <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                                    Model comparison, MAE/RMSE and product-level forecast details.
                                </p>
                            </div>

                            <button
                                onClick={() => setShowForecastDrawer(false)}
                                className="grid h-10 w-10 place-items-center rounded-full bg-[#eef6fb] text-[#17325c]"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="space-y-6 p-7">
                            <section className="rounded-3xl bg-[#07102f] p-6 text-white">
                                <p className="text-xs font-bold uppercase tracking-widest text-blue-100">
                                    Selected Forecast Result
                                </p>

                                <h3 className="mt-3 text-3xl font-extrabold">
                                    {topForecastProduct?.product_name || "No Data"}
                                </h3>

                                <div className="mt-5 grid grid-cols-2 gap-4">
                                    <DrawerMetric
                                        label="Forecast Quantity"
                                        value={topForecastProduct?.forecast_quantity || 0}
                                    />
                                    <DrawerMetric
                                        label="Selected Model"
                                        value={topForecastProduct?.selected_model || "-"}
                                    />
                                    <DrawerMetric
                                        label="MAE"
                                        value={topForecastProduct?.mae ?? "-"}
                                    />
                                    <DrawerMetric
                                        label="RMSE"
                                        value={topForecastProduct?.rmse ?? "-"}
                                    />
                                </div>
                            </section>

                            <section className="rounded-3xl bg-[#f8fcff] p-6">
                                <h3 className="text-xl font-extrabold text-[#07102f]">
                                    Model Comparison
                                </h3>

                                <p className="mt-1 text-sm text-[#6f85a3]">
                                    The backend compares Linear Regression and Prophet. The lower RMSE model is used for the final forecast.
                                </p>

                                <div className="mt-5 overflow-hidden rounded-2xl border border-blue-100">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                            <tr>
                                                <th className="px-4 py-3">Model</th>
                                                <th className="px-4 py-3">Forecast</th>
                                                <th className="px-4 py-3">MAE</th>
                                                <th className="px-4 py-3">RMSE</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {(topForecastProduct?.model_comparison || []).map((model) => (
                                                <tr key={model.model} className="border-t bg-white">
                                                    <td className="px-4 py-4 font-bold text-[#17325c]">
                                                        {model.model}
                                                    </td>
                                                    <td className="px-4 py-4">{model.forecast_quantity}</td>
                                                    <td className="px-4 py-4">{model.mae}</td>
                                                    <td className="px-4 py-4 font-bold text-[#1e4db7]">
                                                        {model.rmse}
                                                    </td>
                                                </tr>
                                            ))}

                                            {(!topForecastProduct?.model_comparison ||
                                                topForecastProduct.model_comparison.length === 0) && (
                                                    <tr>
                                                        <td
                                                            colSpan="4"
                                                            className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                                                        >
                                                            No model comparison available.
                                                        </td>
                                                    </tr>
                                                )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="rounded-3xl bg-white p-6 shadow-sm">
                                <h3 className="text-xl font-extrabold text-[#07102f]">
                                    Product Forecast Details
                                </h3>

                                <div className="mt-5 overflow-hidden rounded-2xl border border-blue-100">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                            <tr>
                                                <th className="px-4 py-3">Product</th>
                                                <th className="px-4 py-3">Sold</th>
                                                <th className="px-4 py-3">Forecast</th>
                                                <th className="px-4 py-3">Model</th>
                                                <th className="px-4 py-3">RMSE</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {forecastData.map((item) => (
                                                <tr key={item.product_id} className="border-t">
                                                    <td className="px-4 py-4 font-bold text-[#17325c]">
                                                        {item.product_name}
                                                    </td>
                                                    <td className="px-4 py-4">{item.total_quantity}</td>
                                                    <td className="px-4 py-4 font-bold text-[#1e4db7]">
                                                        {item.forecast_quantity}
                                                    </td>
                                                    <td className="px-4 py-4 text-xs font-semibold text-[#6f85a3]">
                                                        {item.selected_model || "-"}
                                                    </td>
                                                    <td className="px-4 py-4 text-xs font-bold text-[#6f85a3]">
                                                        {item.rmse ?? "-"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    </motion.div>
                </div>
            )}

            {showChat && (
                <div className="fixed inset-0 z-50 bg-black/40">
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute bottom-6 right-6 flex h-[82vh] w-[720px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b px-7 py-5">
                            <div className="flex items-center gap-3">
                                <div className="grid h-11 w-11 place-items-center rounded-full bg-[#d9edf8] text-[#1e4db7]">
                                    <Bot size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-extrabold text-[#07102f]">
                                        RetailPulse AI
                                    </h2>
                                    <p className="text-sm font-semibold text-[#6f85a3]">
                                        Sales Forecast Assistant
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowChat(false)}
                                className="grid h-10 w-10 place-items-center rounded-full bg-[#eef6fb]"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-7 py-6">
                            <div className="mb-6">
                                <h3 className="text-3xl font-extrabold text-[#5da9ff]">
                                    Hi there!
                                </h3>
                                <h4 className="mt-1 text-2xl font-extrabold text-[#07102f]">
                                    Get Started With RetailPulse AI
                                </h4>
                            </div>

                            <div className="mb-6 rounded-2xl bg-[#f3f7fb] p-5 text-[#17325c]">
                                I can answer sales forecasting questions using the backend prediction results.
                            </div>

                            <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                {suggestedQuestions.map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => sendMessage(q)}
                                        className="rounded-2xl border border-blue-100 p-4 text-left hover:bg-[#f8fcff]"
                                    >
                                        <p className="text-xs font-bold text-orange-500">Suggestion</p>
                                        <p className="mt-2 font-semibold text-[#17325c]">{q}</p>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-4">
                                {messages.map((msg, index) => (
                                    <div
                                        key={index}
                                        className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"
                                            }`}
                                    >
                                        <div
                                            className={`max-w-[78%] rounded-2xl px-5 py-4 text-sm leading-6 ${msg.sender === "user"
                                                    ? "bg-[#0c2f73] text-white"
                                                    : "bg-[#f3f7fb] text-[#17325c]"
                                                }`}
                                        >
                                            {msg.text}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                        </div>

                        <div className="border-t bg-white p-5">
                            <div className="flex items-center gap-3 rounded-2xl border-2 border-blue-200 px-4 py-3">
                                <input
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") sendMessage();
                                    }}
                                    placeholder="Ask about sales forecasting..."
                                    className="flex-1 bg-transparent outline-none"
                                />

                                <button
                                    onClick={() => sendMessage()}
                                    className="grid h-10 w-10 place-items-center rounded-full bg-[#0c2f73] text-white"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {showSettings && (
                <SimpleModal title="Settings" onClose={() => setShowSettings(false)}>
                    <p className="text-sm font-semibold text-[#6f85a3]">
                        Settings can be connected later. This page currently focuses on sales forecasting.
                    </p>
                </SimpleModal>
            )}
        </>
    );
}

function HeroMetric({ label, value }) {
    return (
        <div className="rounded-2xl bg-white/12 p-5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-100">
                {label}
            </p>

            <h3 className="mt-3 truncate text-2xl font-extrabold text-white">
                {value}
            </h3>
        </div>
    );
}

function MiniMetric({ label, value }) {
    return (
        <div className="rounded-2xl bg-[#f8fcff] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                {label}
            </p>
            <p className="mt-2 text-xl font-extrabold text-[#1e4db7]">
                {value}
            </p>
        </div>
    );
}

function DrawerMetric({ label, value }) {
    return (
        <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-100">
                {label}
            </p>
            <p className="mt-2 truncate text-xl font-extrabold text-white">
                {value}
            </p>
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

            <h2 className={`mt-4 truncate text-xl font-extrabold ${color}`}>
                {value}
            </h2>
        </div>
    );
}

function ForecastTable({ title, data }) {
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">{title}</h2>

            <div className="space-y-3">
                {data.map((item) => (
                    <div
                        key={item.product_id}
                        className="flex items-center justify-between rounded-2xl bg-[#f8fcff] p-4"
                    >
                        <div>
                            <p className="font-extrabold text-[#17325c]">{item.product_name}</p>
                            <p className="text-xs font-bold text-[#6f85a3]">
                                Sold: {item.total_quantity} units
                            </p>
                        </div>

                        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-extrabold text-[#1e4db7]">
                            Forecast {item.forecast_quantity}
                        </span>
                    </div>
                ))}

                {data.length === 0 && <EmptyBox text="No data found." />}
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

function SimpleModal({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[480px] rounded-3xl bg-white p-7 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-2xl font-extrabold text-[#07102f]">{title}</h2>

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
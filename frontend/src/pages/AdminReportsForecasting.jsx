import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BarChart3,
    Bell,
    Bot,
    Boxes,
    Building2,
    FolderKanban,
    HelpCircle,
    LogOut,
    Package,
    RefreshCcw,
    Send,
    Settings,
    ShoppingCart,
    TrendingUp,
    Users,
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

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showChat, setShowChat] = useState(false);
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
            setForecastModel(forecastJson.model || "Pandas + scikit-learn Linear Regression");
            setProducts(Array.isArray(productData) ? productData : []);
            setInventory(Array.isArray(inventoryData) ? inventoryData : []);
        } catch (error) {
            console.error(error);
            alert("Failed to load forecasting data. Please check backend API.");
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem("user");
        sessionStorage.removeItem("user");
        navigate("/");
    };

    const formatCurrency = (amount) => `RM ${Number(amount || 0).toFixed(2)}`;

    const topForecastProduct = forecastData[0] || null;

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

            return `${topForecastProduct.product_name} is expected to be the top-selling product next month, with an estimated ${topForecastProduct.forecast_quantity} units sold. This prediction is generated using ${topForecastProduct.method}.`;
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

    if (loading) {
        return (
            <div className="min-h-screen grid place-items-center bg-[#eef6fb] text-[#6f85a3]">
                <div className="text-center">
                    <TrendingUp size={42} className="mx-auto mb-3" />
                    <p className="font-semibold">Loading Reports & Forecasting...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full overflow-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="grid h-full grid-cols-[250px_minmax(0,1fr)]">
                <aside className="flex min-h-0 flex-col bg-[#d9edf8] px-5 py-6 border-r border-blue-100">
                    <div className="mb-8 text-2xl font-extrabold text-[#1e4db7]">
                        RetailPulse
                    </div>

                    <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
                        <h4 className="font-extrabold text-[#16325b]">
                            {user?.name || "System Admin"}
                        </h4>
                        <p className="mt-1 text-xs text-[#6f85a3]">
                            Admin ID: {user?.user_id || "-"}
                        </p>
                    </div>

                    <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
                        <SidebarButton icon={BarChart3} label="Dashboard" onClick={() => navigate("/admin")} />
                        <SidebarButton icon={Users} label="User Management" onClick={() => navigate("/admin/users")} />
                        <SidebarButton icon={Building2} label="Branch Management" onClick={() => navigate("/admin/branches")} />
                        <SidebarButton icon={FolderKanban} label="Catalog Management" onClick={() => navigate("/admin/catalog")} />
                        <SidebarButton icon={Boxes} label="Inventory Overview" onClick={() => navigate("/admin/inventory")} />
                        <SidebarButton icon={ShoppingCart} label="Sales Monitoring" onClick={() => navigate("/admin/sales")} />
                        <SidebarButton active icon={TrendingUp} label="Reports & Forecasting" />
                        <SidebarButton icon={Bot} label="AI Assistant" onClick={() => setShowChat(true)} />
                    </nav>

                    <div className="mt-4">
                        <SidebarButton icon={HelpCircle} label="Help Support" />
                    </div>
                </aside>

                <motion.main
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className="min-w-0 overflow-y-auto px-8 py-6"
                >
                    <header className="mb-8 flex items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                Reports & Forecasting
                            </h1>
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                Analyze product sales trends and estimate next-month demand.
                            </p>
                            <p className="mt-1 text-xs font-bold text-[#1e4db7]">
                                Model: {forecastModel}
                            </p>
                        </div>

                        <div className="relative ml-auto flex items-center gap-3">
                            <button
                                onClick={fetchData}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <RefreshCcw size={18} />
                            </button>

                            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow">
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

                    <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-4">
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
                            title="Slow-Moving Products"
                            value={slowMovingProducts.length}
                            icon={Boxes}
                            color="text-orange-600"
                        />
                        <SummaryCard
                            title="Low Stock Items"
                            value={lowStockItems.length}
                            icon={Bell}
                            color="text-red-600"
                        />
                    </section>

                    <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Forecast Ranking
                            </h2>
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                Prediction uses Pandas and scikit-learn Linear Regression from backend data.
                            </p>

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
                                    This forecast is generated by the backend using Pandas for data preparation and scikit-learn Linear Regression for prediction.
                                </p>
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

                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <h2 className="mb-5 text-xl font-extrabold text-[#07102f]">
                            Forecast Details
                        </h2>

                        <div className="overflow-hidden rounded-2xl border border-blue-50">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                    <tr>
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3">Total Sold</th>
                                        <th className="px-4 py-3">Total Revenue</th>
                                        <th className="px-4 py-3">Forecast Qty</th>
                                        <th className="px-4 py-3">Trend</th>
                                        <th className="px-4 py-3">Method</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {forecastData.map((item) => (
                                        <tr key={item.product_id} className="border-t">
                                            <td className="px-4 py-4 font-bold">{item.product_name}</td>
                                            <td className="px-4 py-4">{item.total_quantity}</td>
                                            <td className="px-4 py-4 font-bold text-green-600">
                                                {formatCurrency(item.total_revenue)}
                                            </td>
                                            <td className="px-4 py-4 font-bold text-[#1e4db7]">
                                                {item.forecast_quantity}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-[#1e4db7]">
                                                    {item.trend}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-xs font-semibold text-[#6f85a3]">
                                                {item.method}
                                            </td>
                                        </tr>
                                    ))}

                                    {forecastData.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan="6"
                                                className="px-4 py-6 text-center font-semibold text-[#6f85a3]"
                                            >
                                                No forecast data found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </motion.main>
            </div>

            <button
                onClick={() => setShowChat(true)}
                className="fixed bottom-7 right-7 z-40 grid h-16 w-16 place-items-center rounded-full bg-[#0c2f73] text-white shadow-2xl hover:bg-[#103986]"
            >
                <Bot size={30} />
            </button>

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
                                        className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
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
        </div>
    );
}

function SidebarButton({ icon: Icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition ${active
                    ? "bg-white font-bold text-[#1e4db7] shadow"
                    : "bg-white/30 font-semibold text-[#254e7a] hover:bg-white/70"
                }`}
        >
            <Icon size={18} className="shrink-0" />
            <span className="min-w-0 truncate text-sm">{label}</span>
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
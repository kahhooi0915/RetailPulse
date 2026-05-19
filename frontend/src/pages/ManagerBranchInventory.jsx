import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BarChart3,
    Truck,
    Boxes,
    HelpCircle,
    Bell,
    Settings,
    RefreshCcw,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

export default function ManagerBranchInventory() {
    const navigate = useNavigate();

    const [toast, setToast] = useState(null);
    const [user, setUser] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [search, setSearch] = useState("");
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [products, setProducts] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [transferItems, setTransferItems] = useState({});

    useEffect(() => {
        const savedUser =
            JSON.parse(sessionStorage.getItem("user")) ||
            JSON.parse(sessionStorage.getItem("user"));

        if (!savedUser) {
            navigate("/");
            return;
        }

        setUser(savedUser);
        fetchInventory(savedUser.branch_id);
    }, [navigate]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const fetchInventory = async (branchId) => {
        try {
            const [invRes, productRes, transferRes] = await Promise.all([
                fetch(`${API_BASE}/admin/inventory`),
                fetch(`${API_BASE}/admin/products`),
                fetch(`${API_BASE}/stock-transfers`),
            ]);

            const invData = await invRes.json();
            const productData = await productRes.json();

            const transferData = await transferRes.json();
            setTransfers(Array.isArray(transferData) ? transferData : []);

            const itemsMap = {};

            await Promise.all(
                (Array.isArray(transferData) ? transferData : []).map(async (transfer) => {
                    const itemRes = await fetch(
                        `${API_BASE}/stock-transfer/${transfer.transfer_id}/items`
                    );
                    const itemData = await itemRes.json();

                    itemsMap[transfer.transfer_id] = Array.isArray(itemData) ? itemData : [];
                })
            );

            setTransferItems(itemsMap);

            setProducts(Array.isArray(productData) ? productData : []);

            const branchData = Array.isArray(invData)
                ? invData
                    .filter((item) => Number(item.branch_id) === Number(branchId))
                    .map((item) => {
                        const product = productData.find(
                            (p) => Number(p.product_id) === Number(item.product_id)
                        );

                        return {
                            ...item,
                            reorder_level: product ? Number(product.reorder_level) : 0,
                        };
                    })
                : [];

            setInventory(branchData);
        } catch (err) {
            console.error(err);
            alert("Failed to load inventory");
        }
    };

    const logout = () => {
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("user");
        navigate("/");
    };

    const filtered = inventory.filter((item) =>
        item.product_name.toLowerCase().includes(search.toLowerCase())
    );

    const hasExistingTransferRequest = (productId) => {
        return transfers.some((transfer) => {
            const isForThisBranch =
                Number(transfer.to_branch_id) === Number(user?.branch_id);

            const isActive =
                transfer.status === "PENDING" || transfer.status === "APPROVED";

            const hasProduct = transferItems[transfer.transfer_id]?.some(
                (item) => Number(item.product_id) === Number(productId)
            );

            return isForThisBranch && isActive && hasProduct;
        });
    };

    const handleAutoSuggestTransfer = async (item) => {
        try {
            const res = await fetch(`${API_BASE}/manager/stock-transfer/auto-suggest`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    product_id: Number(item.product_id),
                    to_branch_id: Number(user.branch_id),
                    requested_by: Number(user.user_id),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setToast({
                    type: "error",
                    message: data.message || "Failed to create transfer request.",
                });
                return;
            }

            setToast({
                type: "success",
                message: `Transfer ${data.transfer_code} created successfully`,
            });
            fetchInventory(user.branch_id);
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: data.message || "Failed to create transfer request.",
            });
        }
    };

    return (
        <div className="h-screen w-full overflow-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="grid h-full grid-cols-[230px_minmax(0,1fr)]">

                {/* SIDEBAR (EXACT SAME) */}
                <aside className="flex flex-col bg-[#d9edf8] px-5 py-6 border-r border-blue-100">
                    <div className="mb-8 text-2xl font-extrabold text-[#1e4db7]">
                        RetailPulse
                    </div>

                    <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
                        <h4 className="font-extrabold text-[#16325b]">
                            {user?.branch_name || "Branch"}
                        </h4>
                        <p className="mt-1 text-xs text-[#6f85a3]">
                            Manager ID: {user?.user_id}
                        </p>
                    </div>

                    <nav className="space-y-3">
                        <button
                            onClick={() => navigate("/manager-dashboard")}
                            className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                        >
                            <BarChart3 size={18} />
                            <span>Dashboard</span>
                        </button>

                        <button
                            onClick={() => navigate("/manager-stock-transfer")}
                            className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
                        >
                            <Truck size={18} />
                            <span>Stock Transfer</span>
                        </button>

                        <button className="flex w-full min-w-0 items-center gap-4 rounded-2xl bg-white px-4 py-4 font-bold text-[#1e4db7] shadow">
                            <Boxes size={18} />
                            <span className="whitespace-nowrap">Branch Inventory</span>
                        </button>
                    </nav>

                    <div className="mt-auto space-y-3">
                        <button
                            onClick={() => setShowHelp(true)}
                            className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 text-sm font-semibold text-[#254e7a]"
                        >
                            <HelpCircle size={17} />
                            <span>Help Support</span>
                        </button>
                    </div>
                </aside>

                {/* MAIN */}
                <motion.main
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="min-w-0 overflow-y-auto px-8 py-6"
                >
                    {/* HEADER */}
                    <header className="mb-8 flex items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                Branch Inventory
                            </h1>
                            <p className="text-sm text-[#6f85a3]">
                                Monitor stock levels and manage low stock items.
                            </p>
                        </div>

                        <div className="relative ml-auto flex items-center gap-3">
                            <button
                                onClick={() => fetchInventory(user.branch_id)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
                            >
                                <RefreshCcw size={18} />
                            </button>

                            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow">
                                <Bell size={18} />
                            </button>

                            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow">
                                <Settings size={18} />
                            </button>

                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="grid h-11 w-11 place-items-center rounded-full bg-[#0d2d6c] text-white font-bold"
                            >
                                {user?.name?.charAt(0) || "M"}
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 top-14 w-48 bg-white shadow-xl rounded-2xl p-3">
                                    <button
                                        onClick={() => navigate("/user-profile")}
                                        className="w-full text-left px-4 py-3 hover:bg-[#eef6fb] rounded-xl font-bold"
                                    >
                                        User Profile
                                    </button>
                                    <button
                                        onClick={logout}
                                        className="w-full text-left px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-bold"
                                    >
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </header>

                    {/* SEARCH */}
                    <div className="mb-6 flex gap-4">
                        <input
                            type="text"
                            placeholder="Search product..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-80 rounded-xl border px-4 py-3 shadow-sm"
                        />
                    </div>

                    {/* TABLE */}
                    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                <tr>
                                    <th className="px-4 py-3">Product</th>
                                    <th className="px-4 py-3">Code</th>
                                    <th className="px-4 py-3">Stock</th>
                                    <th className="px-4 py-3">Reorder</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filtered.map((item) => {
                                    const isLow = item.quantity_in_stock <= item.reorder_level;

                                    return (
                                        <tr
                                            key={item.product_id}
                                            className="border-t"
                                        >
                                            <td className="px-4 py-4 font-bold">
                                                {item.product_name}
                                            </td>
                                            <td className="px-4 py-4">{item.product_code}</td>
                                            <td className="px-4 py-4">{item.quantity_in_stock}</td>
                                            <td className="px-4 py-4">{item.reorder_level}</td>
                                            <td className="px-4 py-4">
                                                {isLow ? (
                                                    <div className="flex items-center justify-between w-full">

                                                        {/* LEFT SIDE */}
                                                        <span className="text-red-500 font-bold">
                                                            LOW STOCK
                                                        </span>

                                                        {/* RIGHT SIDE */}
                                                        {hasExistingTransferRequest(item.product_id) ? (
                                                            <button
                                                                disabled
                                                                className="rounded-full bg-gray-300 px-4 py-2 text-xs font-extrabold text-gray-600"
                                                            >
                                                                Already Requested
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleAutoSuggestTransfer(item)}
                                                                className="rounded-full bg-[#0c2f73] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#173f8a]"
                                                            >
                                                                Auto Suggest Transfer
                                                            </button>
                                                        )}

                                                    </div>
                                                ) : (
                                                    <span className="text-green-600 font-bold">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center py-6">
                                            No data found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.main>
            </div>

            {/* HELP MODAL */}
            {showHelp && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-2xl w-[400px]">
                        <h2 className="text-xl font-bold mb-3">Help</h2>
                        <p className="text-sm">
                            Monitor inventory and identify low stock items that need transfer.
                        </p>
                        <button
                            onClick={() => setShowHelp(false)}
                            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 40 }}
                    transition={{ duration: 0.25 }}
                    className="fixed top-6 right-6 z-50"
                >
                    <div
                        className={`px-5 py-4 rounded-2xl shadow-lg text-white font-semibold flex items-center gap-3
      ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}
                    >
                        {toast.type === "success" ? "✔" : "⚠"}
                        {toast.message}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
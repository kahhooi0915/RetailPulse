import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bell,
    Settings,
    RefreshCcw,
    Pencil,
} from "lucide-react";
import { motion } from "framer-motion";
import ManagerSidebar from "../components/ManagerSidebar";
import api from "../api/axios";

const API_BASE = "http://localhost:5000";

export default function ManagerBranchInventory() {
    const navigate = useNavigate();

    const [toast, setToast] = useState(null);
    const [user] = useState(() => JSON.parse(sessionStorage.getItem("user")));
    const [inventory, setInventory] = useState([]);
    const [search, setSearch] = useState("");
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [transfers, setTransfers] = useState([]);
    const [transferItems, setTransferItems] = useState({});

    const [editingItem, setEditingItem] = useState(null);
    const [editQuantity, setEditQuantity] = useState("");
    const [savingStock, setSavingStock] = useState(false);

    // For auto-suggested transfer modal
    const [allInventory, setAllInventory] = useState([]);
    const [suggestionModal, setSuggestionModal] = useState(null);
    const [creatingTransfer, setCreatingTransfer] = useState(false);

    const fetchInventory = useCallback(async (branchId) => {
        try {
            const [invRes, productRes, transferRes] = await Promise.all([
                fetch(`${API_BASE}/admin/inventory`),
                fetch(`${API_BASE}/admin/products`),
                fetch(`${API_BASE}/stock-transfers`),
            ]);

            const invData = await invRes.json();
            setAllInventory(Array.isArray(invData) ? invData : []);
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
    }, []);

    useEffect(() => {
        if (!user) {
            navigate("/");
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchInventory(user.branch_id);
    }, [fetchInventory, navigate, user]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

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

    const filtered = inventory.filter((item) =>
        item.product_name.toLowerCase().includes(search.toLowerCase())
    );

    const activeTransferStatuses = ["PENDING", "PENDING_SOURCE", "APPROVED"];

    const hasExistingTransferRequest = (productId) => {
        return transfers.some((transfer) => {
            const isForThisBranch =
                Number(transfer.to_branch_id) === Number(user?.branch_id);

            const isActive = activeTransferStatuses.includes(transfer.status);

            const hasProduct = transferItems[transfer.transfer_id]?.some(
                (item) => Number(item.product_id) === Number(productId)
            ) || transfer.product_ids?.some(
                (id) => Number(id) === Number(productId)
            );

            return isForThisBranch && isActive && hasProduct;
        });
    };

    const openTransferSuggestion = (item) => {
        const candidateBranches = allInventory
            .filter((inv) =>
                Number(inv.product_id) === Number(item.product_id) &&
                Number(inv.branch_id) !== Number(user.branch_id) &&
                inv.branch_status !== "INACTIVE" &&
                Number(inv.quantity_in_stock) > Number(item.reorder_level)
            )
            .sort((a, b) => Number(b.quantity_in_stock) - Number(a.quantity_in_stock));

        if (candidateBranches.length === 0) {
            setToast({
                type: "error",
                message: "No suitable branch has enough stock for this product.",
            });
            return;
        }

        const sourceBranch = candidateBranches[0];
        const reorderLevel = Number(item.reorder_level);
        const currentStock = Number(item.quantity_in_stock);
        const sourceSurplus = Number(sourceBranch.quantity_in_stock) - reorderLevel;
        const stockDeficit = reorderLevel - currentStock;
        const targetQuantity = stockDeficit > 0 ? stockDeficit : reorderLevel;
        const suggestedQty = Math.min(sourceSurplus, targetQuantity);

        if (suggestedQty <= 0) {
            setToast({
                type: "error",
                message: "No transferable quantity is available for this product.",
            });
            return;
        }

        setSuggestionModal({
            item,
            sourceBranch,
            suggestedQty,
        });
    };

    const handleAutoSuggestTransfer = async () => {
        if (!suggestionModal) return;

        const item = suggestionModal.item;

        try {
            setCreatingTransfer(true);

            const res = await fetch(`${API_BASE}/manager/stock-transfer/auto-suggest`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    product_id: Number(item.product_id),
                    to_branch_id: Number(user.branch_id),
                    from_branch_id: Number(suggestionModal.sourceBranch.branch_id),
                    quantity: Number(suggestionModal.suggestedQty),
                    requested_by: Number(user.user_id),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setToast({
                    type: "error",
                    message: data.message || "Failed to create transfer request.",
                });
                setCreatingTransfer(false);
                return;
            }

            setToast({
                type: "success",
                message: `Transfer ${data.transfer_code} created successfully`,
            });

            setTransfers((current) => [
                {
                    transfer_id: data.transfer_id,
                    transfer_code: data.transfer_code,
                    from_branch_id: data.from_branch_id,
                    to_branch_id: data.to_branch_id,
                    status: "PENDING_SOURCE",
                    requested_by: Number(user.user_id),
                    product_ids: [Number(item.product_id)],
                },
                ...current,
            ]);
            setTransferItems((current) => ({
                ...current,
                [data.transfer_id]: [
                    {
                        transfer_id: data.transfer_id,
                        product_id: Number(item.product_id),
                        quantity: data.quantity,
                    },
                ],
            }));
            setSuggestionModal(null);
            setCreatingTransfer(false);
            fetchInventory(user.branch_id);
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: "Failed to create transfer request.",
            });
            setCreatingTransfer(false);
        }
    };

    const openEditModal = (item) => {
        setEditingItem(item);
        setEditQuantity(String(item.quantity_in_stock));
    };

    const closeEditModal = () => {
        setEditingItem(null);
        setEditQuantity("");
        setSavingStock(false);
    };

    const handleUpdateStock = async () => {
        if (!editingItem) return;

        if (editQuantity === "" || Number(editQuantity) < 0) {
            setToast({
                type: "error",
                message: "Stock quantity cannot be empty or negative.",
            });
            return;
        }

        try {
            setSavingStock(true);

            const res = await fetch(
                `${API_BASE}/admin/inventory/${editingItem.product_id}/${editingItem.branch_id}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        quantity_in_stock: Number(editQuantity),
                        actor_user_id: user.user_id,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                setToast({
                    type: "error",
                    message: data.message || "Failed to update stock.",
                });
                setSavingStock(false);
                return;
            }

            setToast({
                type: "success",
                message: "Stock updated successfully.",
            });

            closeEditModal();
            fetchInventory(user.branch_id);
        } catch (error) {
            console.error(error);
            setToast({
                type: "error",
                message: "Failed to update stock.",
            });
            setSavingStock(false);
        }
    };

    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-[#eef6fb] text-[#17325c]">
            <div className="flex h-screen w-full overflow-x-hidden">
                <ManagerSidebar user={user} onOpenHelp={() => setShowHelp(true)} />

                {/* MAIN */}
                <motion.main
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6"
                >
                    {/* HEADER */}
                    <header className="mb-8 flex items-center gap-5">
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#07102f]">
                                Branch Inventory
                            </h1>
                            <p className="text-sm text-[#6f85a3]">
                                Monitor stock levels and update branch inventory quantity.
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
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filtered.map((item) => {
                                    const isLow = item.quantity_in_stock <= item.reorder_level;

                                    return (
                                        <tr key={item.product_id} className="border-t">
                                            <td className="px-4 py-4 font-bold">
                                                {item.product_name}
                                            </td>
                                            <td className="px-4 py-4">{item.product_code}</td>
                                            <td className="px-4 py-4 font-bold">
                                                {item.quantity_in_stock}
                                            </td>
                                            <td className="px-4 py-4">{item.reorder_level}</td>
                                            <td className="px-4 py-4">
                                                {isLow ? (
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="text-red-500 font-bold">
                                                            LOW STOCK
                                                        </span>

                                                        {hasExistingTransferRequest(item.product_id) ? (
                                                            <button
                                                                disabled
                                                                className="rounded-full bg-gray-300 px-4 py-2 text-xs font-extrabold text-gray-600"
                                                            >
                                                                Already Requested
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => openTransferSuggestion(item)}
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
                                            <td className="px-4 py-4 text-right">
                                                <button
                                                    onClick={() => openEditModal(item)}
                                                    className="inline-flex items-center gap-2 rounded-full bg-[#1e4db7] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#173f8a]"
                                                >
                                                    <Pencil size={14} />
                                                    Edit Stock
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center py-6">
                                            No data found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.main>
            </div>

            {/* EDIT STOCK MODAL */}
            {editingItem && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-[430px] rounded-3xl bg-white p-6 shadow-2xl"
                    >
                        <h2 className="text-xl font-extrabold text-[#07102f]">
                            Edit Product Stock
                        </h2>

                        <p className="mt-1 text-sm text-[#6f85a3]">
                            Update the inventory quantity for your branch only.
                        </p>

                        <div className="mt-5 rounded-2xl bg-[#eef6fb] p-4">
                            <p className="text-xs font-bold uppercase text-[#6f85a3]">
                                Product
                            </p>
                            <p className="mt-1 font-extrabold text-[#17325c]">
                                {editingItem.product_name}
                            </p>

                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs font-bold uppercase text-[#6f85a3]">
                                        Product Code
                                    </p>
                                    <p className="font-bold">{editingItem.product_code}</p>
                                </div>

                                <div>
                                    <p className="text-xs font-bold uppercase text-[#6f85a3]">
                                        Reorder Level
                                    </p>
                                    <p className="font-bold">{editingItem.reorder_level}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                                Stock Quantity
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                className="w-full rounded-2xl border border-blue-100 px-4 py-3 font-bold outline-none focus:border-[#1e4db7]"
                            />
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={closeEditModal}
                                className="rounded-full bg-gray-100 px-5 py-3 text-sm font-extrabold text-gray-600 hover:bg-gray-200"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleUpdateStock}
                                disabled={savingStock}
                                className="rounded-full bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#173f8a] disabled:bg-gray-400"
                            >
                                {savingStock ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* HELP MODAL */}
            {showHelp && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-2xl w-[400px]">
                        <h2 className="text-xl font-bold mb-3">Help</h2>
                        <p className="text-sm">
                            Monitor inventory, update branch stock quantity, and identify low stock items that need transfer.
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

            {suggestionModal && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-[430px] rounded-xl bg-white p-6 shadow-2xl"
                    >
                        <h2 className="text-lg font-extrabold text-[#07102f]">
                            Confirm Stock Transfer
                        </h2>

                        <p className="mt-3 text-xs leading-relaxed text-[#6f85a3]">
                            The system found a suitable branch to supply this low-stock product.
                        </p>

                        <div className="mt-5 rounded-md bg-[#eef6fb] px-5 py-4 text-xs">
                            {[
                                ["Product", suggestionModal.item.product_name],
                                ["Current Branch", user?.branch_name],
                                ["Take Stock From", suggestionModal.sourceBranch.branch_name],
                                ["Source Branch Stock", suggestionModal.sourceBranch.quantity_in_stock],
                                ["Your Current Stock", suggestionModal.item.quantity_in_stock],
                                ["Reorder Level", suggestionModal.item.reorder_level],
                                ["Request Quantity", `${suggestionModal.suggestedQty} units`],
                            ].map(([label, value]) => (
                                <div key={label} className="mb-2 flex items-center justify-between gap-6 last:mb-0">
                                    <span className="font-extrabold text-[#17325c]">
                                        {label}:
                                    </span>
                                    <span className="text-right font-bold text-[#17325c]">
                                        {value}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <p className="mt-5 text-center text-xs font-extrabold text-[#17325c]">
                            Do you want to create this stock transfer request?
                        </p>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setSuggestionModal(null)}
                                className="rounded-lg bg-[#e5f3fb] px-4 py-3 text-xs font-extrabold text-[#17325c] hover:bg-[#d7ebf7]"
                            >
                                No
                            </button>

                            <button
                                onClick={handleAutoSuggestTransfer}
                                disabled={creatingTransfer}
                                className="rounded-lg bg-[#15108a] px-4 py-3 text-xs font-extrabold text-white shadow-md hover:bg-[#0f0a6d] disabled:bg-gray-400"
                            >
                                {creatingTransfer ? "Creating..." : "Yes, Request Transfer"}
                            </button>
                        </div>
                    </motion.div>
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

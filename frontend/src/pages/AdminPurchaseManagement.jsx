import DashboardLayout from "../layouts/DashboardLayout";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Boxes,
    CheckCircle,
    Eye,
    PackagePlus,
    Plus,
    Search,
    ShoppingCart,
    Truck,
    X,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = "http://localhost:5000";

const emptyPurchase = {
    supplier_id: "",
    product_id: "",
    quantity: "",
    notes: "",
};

const emptyDetail = {
    product_id: "",
    quantity: "",
    unit_cost: "",
};

export default function AdminPurchaseManagement() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [products, setProducts] = useState([]);
    const [supplierProducts, setSupplierProducts] = useState([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showPurchaseForm, setShowPurchaseForm] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
    const [detailForm, setDetailForm] = useState(emptyDetail);

    const [toast, setToast] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [settingsData, setSettingsData] = useState(() => {
        const savedSettings = sessionStorage.getItem("adminSettings");
        return savedSettings
            ? JSON.parse(savedSettings)
            : { compactMode: false, dashboardView: "Monthly" };
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

    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2500);
    };

    const loadData = async () => {
        try {
            setLoading(true);

            const [purchaseRes, supplierRes, branchRes, productRes, supplierProductRes] = await Promise.all([
                fetch(`${API_BASE}/admin/purchases`),
                fetch(`${API_BASE}/admin/suppliers`),
                fetch(`${API_BASE}/admin/branches`),
                fetch(`${API_BASE}/admin/products?available=1`),
                fetch(`${API_BASE}/admin/supplier-products?available=1`),
            ]);

            setPurchases(await purchaseRes.json());
            setSuppliers(await supplierRes.json());
            setBranches(await branchRes.json());
            setProducts(await productRes.json());
            setSupplierProducts(await supplierProductRes.json());
        } catch (error) {
            console.error(error);
            showToast("Failed to load purchase data.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredPurchases = useMemo(() => {
        const keyword = searchTerm.toLowerCase();

        return purchases.filter((item) =>
            item.purchase_code?.toLowerCase().includes(keyword) ||
            item.supplier_name?.toLowerCase().includes(keyword) ||
            item.branch_name?.toLowerCase().includes(keyword) ||
            item.status?.toLowerCase().includes(keyword)
        );
    }, [purchases, searchTerm]);

    const openCreatePurchase = () => {
        setPurchaseForm(emptyPurchase);
        setShowPurchaseForm(true);
    };

    const warehouseLocation = useMemo(() => {
        return branches.find((branch) => branch.branch_type === "WAREHOUSE");
    }, [branches]);

    const supplierProductOptions = useMemo(() => {
        if (!purchaseForm.supplier_id) return [];

        return supplierProducts.filter(
            (item) =>
                Number(item.supplier_id) === Number(purchaseForm.supplier_id) &&
                item.status === "ACTIVE"
        );
    }, [supplierProducts, purchaseForm.supplier_id]);

    const selectedSupplierProduct = useMemo(() => {
        return supplierProductOptions.find(
            (item) => Number(item.product_id) === Number(purchaseForm.product_id)
        );
    }, [supplierProductOptions, purchaseForm.product_id]);

    const purchaseQuantity = Number(purchaseForm.quantity || 0);
    const purchaseUnitPrice = Number(selectedSupplierProduct?.purchase_price || 0);
    const purchaseTotal = purchaseQuantity * purchaseUnitPrice;

    const estimatedDeliveryDate = useMemo(() => {
        const leadTime = Number(selectedSupplierProduct?.lead_time_days || 0);
        if (!leadTime) return "-";

        const date = new Date();
        date.setDate(date.getDate() + leadTime);

        return date.toLocaleDateString("en-GB");
    }, [selectedSupplierProduct]);

    const createPurchase = async (e) => {
        e.preventDefault();

        if (!purchaseForm.supplier_id) return showToast("Supplier is required.", "error");
        if (!purchaseForm.product_id) return showToast("Product is required.", "error");
        if (!purchaseForm.quantity || Number(purchaseForm.quantity) <= 0) {
            return showToast("Quantity must be greater than 0.", "error");
        }

        try {
            setSaving(true);

            const res = await fetch(`${API_BASE}/admin/purchases`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supplier_id: Number(purchaseForm.supplier_id),
                    product_id: Number(purchaseForm.product_id),
                    quantity: Number(purchaseForm.quantity),
                    notes: purchaseForm.notes.trim(),
                    created_by: user.user_id,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to create purchase.", "error");
                return;
            }

            showToast("Purchase order created successfully.");
            setShowPurchaseForm(false);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to create purchase.", "error");
        } finally {
            setSaving(false);
        }
    };

    const openPurchaseDetail = async (purchaseId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/purchases/${purchaseId}`);
            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to load purchase details.", "error");
                return;
            }

            setSelectedPurchase(data);
            setDetailForm(emptyDetail);
            setShowDetailModal(true);
        } catch (error) {
            console.error(error);
            showToast("Failed to load purchase details.", "error");
        }
    };

    const addPurchaseDetail = async (e) => {
        e.preventDefault();

        if (!detailForm.product_id) return showToast("Product is required.", "error");
        if (!detailForm.quantity || Number(detailForm.quantity) <= 0) return showToast("Quantity must be greater than 0.", "error");
        if (detailForm.unit_cost === "" || Number(detailForm.unit_cost) < 0) return showToast("Unit cost cannot be negative.", "error");

        try {
            setSaving(true);

            const res = await fetch(`${API_BASE}/admin/purchases/${selectedPurchase.purchase_id}/details`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: Number(detailForm.product_id),
                    quantity: Number(detailForm.quantity),
                    unit_cost: Number(detailForm.unit_cost),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to add purchase item.", "error");
                return;
            }

            showToast("Purchase item added successfully.");
            setDetailForm(emptyDetail);
            openPurchaseDetail(selectedPurchase.purchase_id);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to add purchase item.", "error");
        } finally {
            setSaving(false);
        }
    };

    const markAsOrdered = async (purchaseId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/purchases/${purchaseId}/ordered`, {
                method: "PUT",
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to mark as ordered.", "error");
                return;
            }

            showToast("Purchase marked as ORDERED.");
            loadData();
            if (selectedPurchase?.purchase_id === purchaseId) openPurchaseDetail(purchaseId);
        } catch (error) {
            console.error(error);
            showToast("Failed to mark as ordered.", "error");
        }
    };

    const cancelPurchaseOrder = async (purchaseId) => {
        if (!window.confirm("Cancel this purchase order?")) return;

        try {
            const res = await fetch(`${API_BASE}/admin/purchases/${purchaseId}/cancel`, {
                method: "PUT",
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to cancel purchase order.", "error");
                return;
            }

            showToast("Purchase order cancelled.");
            loadData();
            if (selectedPurchase?.purchase_id === purchaseId) openPurchaseDetail(purchaseId);
        } catch (error) {
            console.error(error);
            showToast("Failed to cancel purchase order.", "error");
        }
    };

    const markAsReceived = async (purchaseId) => {
        if (!window.confirm("Confirm received? Inventory will be increased.")) return;

        try {
            const res = await fetch(`${API_BASE}/admin/purchases/${purchaseId}/receive`, {
                method: "PUT",
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to receive purchase.", "error");
                return;
            }

            showToast(data.message || "Purchase received successfully.");
            loadData();
            if (selectedPurchase?.purchase_id === purchaseId) openPurchaseDetail(purchaseId);
        } catch (error) {
            console.error(error);
            showToast("Failed to receive purchase.", "error");
        }
    };

    const pendingCount = purchases.filter((p) => p.status === "PENDING").length;
    const orderedCount = purchases.filter((p) => p.status === "ORDERED").length;
    const receivedCount = purchases.filter((p) => p.status === "RECEIVED").length;

    return (
        <>
            <DashboardLayout
                user={user}
                title="Purchase Management"
                subtitle="Create supplier purchase orders and receive stock into the warehouse."
                modelText={`Current View: ${settingsData.dashboardView}`}
                onRefresh={loadData}
                onOpenSettings={() => setShowSettings(true)}
                onOpenNotifications={() => setShowNotifications(true)}
                notificationCount={orderedCount}
                compactMode={settingsData.compactMode}
            >
                {loading ? (
                    <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
                        <div className="text-center">
                            <ShoppingCart size={42} className="mx-auto mb-3" />
                            <p className="font-semibold">Loading Purchase Management...</p>
                        </div>
                    </div>
                ) : (
                    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
                        <section className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
                            <SummaryCard title="Total Purchases" value={purchases.length} icon={ShoppingCart} color="text-[#1e4db7]" />
                            <SummaryCard title="Pending" value={pendingCount} icon={PackagePlus} color="text-orange-500" />
                            <SummaryCard title="Ordered" value={orderedCount} icon={Truck} color="text-[#07102f]" />
                            <SummaryCard title="Received" value={receivedCount} icon={CheckCircle} color="text-green-600" />
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">Purchase Orders</h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Purchase stock from suppliers and receive it into the warehouse before branch transfer.
                                    </p>
                                </div>

                                <button
                                    onClick={openCreatePurchase}
                                    className="ml-auto flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                >
                                    <Plus size={17} />
                                    Create Purchase
                                </button>
                            </div>

                            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
                                <Search size={18} className="text-[#6f85a3]" />
                                <input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search purchase code, supplier, branch, or status..."
                                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0bb]"
                                />
                            </div>

                            <PurchaseTable
                                purchases={filteredPurchases}
                                onView={openPurchaseDetail}
                                onOrdered={markAsOrdered}
                                onReceived={markAsReceived}
                            />
                        </section>
                    </motion.div>
                )}
            </DashboardLayout>

            {showPurchaseForm && (
                <Modal title="Create Purchase Order" subtitle="Create a supplier order for warehouse replenishment." onClose={() => setShowPurchaseForm(false)}>
                    <form onSubmit={createPurchase} className="space-y-5">
                        <FormSelect
                            label="Supplier"
                            value={purchaseForm.supplier_id}
                            onChange={(value) =>
                                setPurchaseForm({
                                    ...purchaseForm,
                                    supplier_id: value,
                                    product_id: "",
                                })
                            }
                            options={[
                                { value: "", label: "Select Supplier" },
                                ...suppliers
                                    .filter((s) => s.status === "ACTIVE")
                                    .map((s) => ({ value: s.supplier_id, label: `${s.supplier_code} - ${s.supplier_name}` })),
                            ]}
                        />

                        <ReadOnlyField
                            label="Receiving Location"
                            value={warehouseLocation?.branch_name || "Warehouse"}
                        />

                        <FormSelect
                            label="Product"
                            value={purchaseForm.product_id}
                            onChange={(value) => setPurchaseForm({ ...purchaseForm, product_id: value })}
                            options={[
                                {
                                    value: "",
                                    label: purchaseForm.supplier_id
                                        ? "Select Product"
                                        : "Select Supplier First",
                                },
                                ...supplierProductOptions.map((item) => ({
                                    value: item.product_id,
                                    label: item.product_name,
                                })),
                            ]}
                        />

                        <FormInput
                            label="Quantity"
                            type="number"
                            value={purchaseForm.quantity}
                            onChange={(value) => setPurchaseForm({ ...purchaseForm, quantity: value })}
                            placeholder="20"
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <ReadOnlyField
                                label="Purchase Price (Per Unit)"
                                value={selectedSupplierProduct ? `RM ${purchaseUnitPrice.toFixed(2)}` : "-"}
                            />
                            <ReadOnlyField
                                label="Lead Time"
                                value={selectedSupplierProduct ? `${selectedSupplierProduct.lead_time_days} Days` : "-"}
                            />
                        </div>

                        <ReadOnlyField
                            label="Estimated Delivery Date"
                            value={estimatedDeliveryDate}
                        />

                        <FormTextarea
                            label="Notes (Optional)"
                            value={purchaseForm.notes}
                            onChange={(value) => setPurchaseForm({ ...purchaseForm, notes: value })}
                            placeholder="Urgent warehouse replenishment."
                        />

                        <div className="rounded-2xl bg-[#f8fcff] p-4">
                            <h3 className="mb-4 font-extrabold text-[#07102f]">Purchase Summary</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <InfoItem label="Unit Price" value={`RM ${purchaseUnitPrice.toFixed(2)}`} />
                                <InfoItem label="Quantity" value={purchaseQuantity || "-"} />
                                <InfoItem label="Total Purchase Amount" value={`RM ${purchaseTotal.toFixed(2)}`} />
                            </div>
                        </div>

                        <FormActions saving={saving} saveText="Create Purchase" onCancel={() => setShowPurchaseForm(false)} />
                    </form>
                </Modal>
            )}

            {showDetailModal && selectedPurchase && (
                <Modal
                    title={`Purchase ${selectedPurchase.purchase_code}`}
                    subtitle={`Status: ${selectedPurchase.status}`}
                    onClose={() => setShowDetailModal(false)}
                    wide
                >
                    <div className="mb-5 grid grid-cols-2 gap-4 rounded-2xl bg-[#f8fcff] p-4">
                        <InfoItem label="Purchase Code" value={selectedPurchase.purchase_code} />
                        <InfoItem label="Total Amount" value={`RM ${Number(selectedPurchase.total_amount).toFixed(2)}`} />
                        <InfoItem label="Status" value={selectedPurchase.status} />
                        <InfoItem label="Purchase Date" value={selectedPurchase.purchase_date?.slice(0, 10)} />
                    </div>

                    {selectedPurchase.status === "PENDING" && (
                        <form onSubmit={addPurchaseDetail} className="mb-6 rounded-2xl border border-blue-50 bg-white p-4">
                            <h3 className="mb-4 font-extrabold text-[#07102f]">Add Purchase Item</h3>

                            <div className="grid grid-cols-3 gap-4">
                                <FormSelect
                                    label="Product"
                                    value={detailForm.product_id}
                                    onChange={(value) => setDetailForm({ ...detailForm, product_id: value })}
                                    options={[
                                        { value: "", label: "Select Product" },
                                        ...products
                                            .filter((p) => p.status === "ACTIVE")
                                            .map((p) => ({ value: p.product_id, label: p.product_name })),
                                    ]}
                                />

                                <FormInput
                                    label="Quantity"
                                    type="number"
                                    value={detailForm.quantity}
                                    onChange={(value) => setDetailForm({ ...detailForm, quantity: value })}
                                    placeholder="100"
                                />

                                <FormInput
                                    label="Unit Cost"
                                    type="number"
                                    value={detailForm.unit_cost}
                                    onChange={(value) => setDetailForm({ ...detailForm, unit_cost: value })}
                                    placeholder="2.50"
                                />
                            </div>

                            <div className="mt-4">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#103986] disabled:opacity-60"
                                >
                                    {saving ? "Adding..." : "Add Item"}
                                </button>
                            </div>
                        </form>
                    )}

                    <PurchaseDetailTable details={selectedPurchase.details || []} />

                    <div className="mt-6 flex justify-end gap-3">
                        {selectedPurchase.status === "PENDING" && (
                            <>
                                <button
                                    onClick={() => cancelPurchaseOrder(selectedPurchase.purchase_id)}
                                    className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-extrabold text-red-600 hover:bg-red-100"
                                >
                                    Cancel Order
                                </button>
                                <button
                                    onClick={() => markAsOrdered(selectedPurchase.purchase_id)}
                                    className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-extrabold text-white hover:bg-orange-600"
                                >
                                    Mark as Ordered
                                </button>
                            </>
                        )}

                        {selectedPurchase.status === "ORDERED" && (
                            <button
                                onClick={() => markAsReceived(selectedPurchase.purchase_id)}
                                className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-green-700"
                            >
                                Mark as Received
                            </button>
                        )}
                    </div>
                </Modal>
            )}

            {showSettings && (
                <Modal title="Admin Settings" subtitle="Configure purchase management view options." onClose={() => setShowSettings(false)}>
                    <div className="space-y-6">
                        <SettingToggle
                            label="Compact Dashboard Mode"
                            value={settingsData.compactMode}
                            onChange={() => setSettingsData({ ...settingsData, compactMode: !settingsData.compactMode })}
                        />

                        <button
                            onClick={() => {
                                sessionStorage.setItem("adminSettings", JSON.stringify(settingsData));
                                setShowSettings(false);
                                showToast("Settings saved successfully.");
                            }}
                            className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986]"
                        >
                            Save Settings
                        </button>
                    </div>
                </Modal>
            )}

            {showNotifications && (
                <div className="fixed inset-0 z-50">
                    <div onClick={() => setShowNotifications(false)} className="absolute inset-0 bg-black/20" />
                    <div className="absolute right-0 top-0 h-full w-[370px] bg-white p-6 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-xl font-extrabold text-[#07102f]">Notifications</h2>
                            <button onClick={() => setShowNotifications(false)} className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]">✕</button>
                        </div>

                        <div className="space-y-4">
                            <NotificationCard title="Ordered Purchases" desc={`${orderedCount} purchase order(s) waiting to be received.`} color="orange" />
                            <NotificationCard title="Pending Purchases" desc={`${pendingCount} purchase order(s) not yet ordered.`} color="blue" />
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 z-[60]">
                    <div className={`rounded-2xl px-5 py-4 text-sm font-extrabold shadow-xl ${toast.type === "error" ? "bg-red-500 text-white" : "bg-green-600 text-white"}`}>
                        {toast.message}
                    </div>
                </div>
            )}
        </>
    );
}

function PurchaseTable({ purchases, onView, onOrdered, onReceived }) {
    return (
        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Purchase</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Receiving Location</th>
                        <th className="px-4 py-3">Total</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {purchases.map((item) => (
                        <tr key={item.purchase_id} className="border-t bg-white">
                            <td className="px-4 py-4">
                                <p className="font-extrabold text-[#17325c]">{item.purchase_code}</p>
                                <p className="mt-1 text-xs font-bold text-[#6f85a3]">{item.purchase_date?.slice(0, 10)}</p>
                            </td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.supplier_name}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.branch_name}</td>
                            <td className="px-4 py-4 font-extrabold text-[#0c2f73]">RM {Number(item.total_amount).toFixed(2)}</td>
                            <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                            <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                    <ActionButton icon={Eye} onClick={() => onView(item.purchase_id)} />

                                    {item.status === "PENDING" && (
                                        <button onClick={() => onOrdered(item.purchase_id)} className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-extrabold text-orange-600 hover:bg-orange-100">
                                            Ordered
                                        </button>
                                    )}

                                    {item.status === "ORDERED" && (
                                        <button onClick={() => onReceived(item.purchase_id)} className="rounded-xl bg-green-50 px-3 py-2 text-xs font-extrabold text-green-600 hover:bg-green-100">
                                            Receive
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}

                    {purchases.length === 0 && (
                        <tr>
                            <td colSpan="6" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                No purchase records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function PurchaseDetailTable({ details }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-blue-50">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Quantity</th>
                        <th className="px-4 py-3">Unit Cost</th>
                        <th className="px-4 py-3">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {details.map((item) => (
                        <tr key={item.purchase_detail_id} className="border-t bg-white">
                            <td className="px-4 py-4 font-extrabold text-[#17325c]">{item.product_name}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.quantity}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">RM {Number(item.unit_cost).toFixed(2)}</td>
                            <td className="px-4 py-4 font-extrabold text-[#0c2f73]">RM {Number(item.subtotal).toFixed(2)}</td>
                        </tr>
                    ))}

                    {details.length === 0 && (
                        <tr>
                            <td colSpan="4" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                No purchase items added yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon, color }) {
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">{title}</p>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef6fb]">
                    <Icon size={18} className={color} />
                </div>
            </div>
            <h2 className={`mt-4 text-2xl font-extrabold ${color}`}>{value}</h2>
        </div>
    );
}

function StatusBadge({ status }) {
    const style =
        status === "RECEIVED"
            ? "bg-green-50 text-green-600"
            : status === "ORDERED"
                ? "bg-blue-50 text-[#1e4db7]"
                : status === "CANCELLED"
                    ? "bg-red-50 text-red-500"
                    : status === "PENDING"
                        ? "bg-orange-50 text-orange-600"
                        : "bg-red-50 text-red-500";

    return <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${style}`}>{status}</span>;
}

function ActionButton({ icon: Icon, onClick }) {
    return (
        <button onClick={onClick} className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100">
            <Icon size={16} />
        </button>
    );
}

function InfoItem({ label, value }) {
    return (
        <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">{label}</p>
            <p className="mt-1 font-extrabold text-[#17325c]">{value || "-"}</p>
        </div>
    );
}

function FormInput({ label, value, onChange, placeholder, type = "text" }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
            />
        </div>
    );
}

function FormTextarea({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows="3"
                className="w-full resize-none rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
            />
        </div>
    );
}

function FormSelect({ label, value, onChange, options }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none"
            >
                {options.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                ))}
            </select>
        </div>
    );
}

function ReadOnlyField({ label, value }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <div className="w-full rounded-2xl bg-[#f8fcff] px-4 py-3 font-semibold text-[#17325c]">
                {value || "-"}
            </div>
        </div>
    );
}

function FormActions({ saving, saveText, onCancel }) {
    return (
        <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="w-full rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#254e7a] hover:bg-blue-100">
                Cancel
            </button>
            <button type="submit" disabled={saving} className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? "Saving..." : saveText}
            </button>
        </div>
    );
}

function Modal({ title, subtitle, children, onClose, wide = false }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className={`max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl ${wide ? "w-[900px]" : "w-[520px]"}`}>
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#07102f]">{title}</h2>
                        {subtitle && <p className="mt-1 text-sm text-[#6f85a3]">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[#eef6fb] text-[#254e7a]">
                        <X size={17} />
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
            <button onClick={onChange} className={`relative h-7 w-14 rounded-full transition ${value ? "bg-[#1e4db7]" : "bg-gray-300"}`}>
                <div className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${value ? "left-8" : "left-1"}`} />
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

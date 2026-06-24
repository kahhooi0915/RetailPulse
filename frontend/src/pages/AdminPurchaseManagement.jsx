import DashboardLayout from "../layouts/DashboardLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    CheckCircle,
    Eye,
    Mail,
    MessageCircle,
    PackagePlus,
    Phone,
    Plus,
    Search,
    ShoppingCart,
    Truck,
    X,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "../utils/formatCurrency";
import { formatCentsInput, formatMoneyValue } from "../utils/moneyInput";

const API_BASE = "http://localhost:5000";

const createEmptyPurchaseItem = () => ({
    row_id: `${Date.now()}-${Math.random()}`,
    product_id: "",
    quantity: "",
    purchase_price: "",
    lead_time_days: "",
});

const emptyPurchase = {
    supplier_id: "",
    receiving_branch_id: "",
    notes: "",
    items: [createEmptyPurchaseItem()],
};

export default function AdminPurchaseManagement() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [user, setUser] = useState(null);
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [supplierProducts, setSupplierProducts] = useState([]);
    const [productsNotPurchased, setProductsNotPurchased] = useState([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showPurchaseForm, setShowPurchaseForm] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
    const [prefilledPurchaseKey, setPrefilledPurchaseKey] = useState("");
    const [focusedProductId, setFocusedProductId] = useState("");
    const viewedPurchaseKeyRef = useRef("");

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

            const [purchaseRes, supplierRes, branchRes, supplierProductRes, productsNotPurchasedRes] = await Promise.all([
                fetch(`${API_BASE}/admin/purchases`),
                fetch(`${API_BASE}/admin/suppliers`),
                fetch(`${API_BASE}/admin/branches`),
                fetch(`${API_BASE}/admin/supplier-products?available=1`),
                fetch(`${API_BASE}/admin/purchases/products-not-purchased`),
            ]);

            setPurchases(await purchaseRes.json());
            setSuppliers(await supplierRes.json());
            setBranches(await branchRes.json());
            setSupplierProducts(await supplierProductRes.json());
            setProductsNotPurchased(await productsNotPurchasedRes.json());
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
        setFocusedProductId("");
        setPurchaseForm({ ...emptyPurchase, items: [createEmptyPurchaseItem()] });
        setShowPurchaseForm(true);
    };

    const openFirstPurchaseForProduct = (product) => {
        const warehouse = branches.find((branch) => branch.branch_type === "WAREHOUSE");

        setFocusedProductId(String(product.product_id));
        setPurchaseForm({
            ...emptyPurchase,
            supplier_id: String(product.supplier_id),
            receiving_branch_id: warehouse ? String(warehouse.branch_id) : "",
            notes: `First purchase order for ${product.product_name}.`,
            items: [{
                ...createEmptyPurchaseItem(),
                product_id: String(product.product_id),
                quantity: "",
                purchase_price: formatMoneyValue(product.purchase_price),
                lead_time_days: product.lead_time_days ?? "",
            }],
        });
        setShowPurchaseForm(true);
    };

    const warehouseLocation = useMemo(() => {
        const selectedBranchId = Number(purchaseForm.receiving_branch_id);
        return branches.find((branch) => Number(branch.branch_id) === selectedBranchId && branch.branch_type === "WAREHOUSE")
            || branches.find((branch) => branch.branch_type === "WAREHOUSE");
    }, [branches, purchaseForm.receiving_branch_id]);

    const supplierProductOptions = useMemo(() => {
        if (!purchaseForm.supplier_id) return [];

        return supplierProducts.filter(
            (item) =>
                Number(item.supplier_id) === Number(purchaseForm.supplier_id) &&
                item.status === "ACTIVE"
        );
    }, [supplierProducts, purchaseForm.supplier_id]);

    const focusedProductSupplierOffers = useMemo(() => {
        if (!focusedProductId) return [];

        return supplierProducts
            .filter((item) => Number(item.product_id) === Number(focusedProductId) && item.status === "ACTIVE")
            .sort((a, b) => {
                const priceDiff = Number(a.purchase_price || 0) - Number(b.purchase_price || 0);
                if (priceDiff !== 0) return priceDiff;
                if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
                return String(a.supplier_name || "").localeCompare(String(b.supplier_name || ""));
            });
    }, [supplierProducts, focusedProductId]);

    const lowestFocusedOfferPrice = focusedProductSupplierOffers.length
        ? Number(focusedProductSupplierOffers[0].purchase_price || 0)
        : null;

    const supplierSelectOptions = useMemo(() => {
        if (focusedProductId) {
            return [
                { value: "", label: focusedProductSupplierOffers.length ? "Select Supplier" : "No supplier can supply this product" },
                ...focusedProductSupplierOffers.map((offer) => {
                    const supplier = suppliers.find((item) => Number(item.supplier_id) === Number(offer.supplier_id));
                    const supplierCode = supplier?.supplier_code || offer.supplier_code || `SUP-${offer.supplier_id}`;
                    const supplierName = supplier?.supplier_name || offer.supplier_name;
                    const isLowest = Number(offer.purchase_price || 0) === lowestFocusedOfferPrice;
                    const suffix = `${formatCurrency(offer.purchase_price)}${isLowest ? " - lowest offer" : ""}`;

                    return {
                        value: offer.supplier_id,
                        label: `${supplierCode} - ${supplierName} (${suffix})`,
                    };
                }),
            ];
        }

        return [
            { value: "", label: "Select Supplier" },
            ...suppliers
                .filter((s) => s.status === "ACTIVE")
                .map((s) => ({ value: s.supplier_id, label: `${s.supplier_code} - ${s.supplier_name}` })),
        ];
    }, [focusedProductId, focusedProductSupplierOffers, lowestFocusedOfferPrice, suppliers]);

    const selectedSupplier = useMemo(() => {
        return suppliers.find((supplier) => Number(supplier.supplier_id) === Number(purchaseForm.supplier_id));
    }, [suppliers, purchaseForm.supplier_id]);

    useEffect(() => {
        const purchaseId = Number(searchParams.get("purchase_id"));
        if (!purchaseId) return;

        const requestKey = `purchase-${purchaseId}`;
        if (viewedPurchaseKeyRef.current === requestKey) return;

        viewedPurchaseKeyRef.current = requestKey;

        const openLinkedPurchase = async () => {
            await Promise.resolve();
            setShowPurchaseForm(false);
            setSearchParams({}, { replace: true });
            openPurchaseDetail(purchaseId);
        };

        openLinkedPurchase();
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        const productId = Number(searchParams.get("product_id"));
        const branchId = Number(searchParams.get("branch_id"));
        if (!productId || !branchId || supplierProducts.length === 0 || branches.length === 0) return;

        const requestKey = `${productId}-${branchId}`;
        if (prefilledPurchaseKey === requestKey) return;

        const supplierProduct = supplierProducts
            .filter((item) => Number(item.product_id) === productId && item.status === "ACTIVE")
            .sort((a, b) => {
                const priceDiff = Number(a.purchase_price || 0) - Number(b.purchase_price || 0);
                if (priceDiff !== 0) return priceDiff;
                return a.is_preferred === b.is_preferred ? 0 : a.is_preferred ? -1 : 1;
            })[0];

        if (!supplierProduct) {
            showToast("No active supplier assigned for this product.", "error");
            setPrefilledPurchaseKey(requestKey);
            return;
        }

        setPurchaseForm({
            ...emptyPurchase,
            supplier_id: String(supplierProduct.supplier_id),
            receiving_branch_id: String(branchId),
            notes: "Warehouse replenishment purchase.",
            items: [{
                ...createEmptyPurchaseItem(),
                product_id: String(productId),
                quantity: "",
                purchase_price: formatMoneyValue(supplierProduct.purchase_price),
                lead_time_days: supplierProduct.lead_time_days ?? "",
            }],
        });
        setFocusedProductId(String(productId));
        setShowPurchaseForm(true);
        setPrefilledPurchaseKey(requestKey);
        setSearchParams({}, { replace: true });
    }, [searchParams, supplierProducts, branches, prefilledPurchaseKey, setSearchParams]);

    const updatePurchaseSupplier = (supplierId) => {
        const selectedSupplierProduct = focusedProductId
            ? supplierProducts.find(
                (item) =>
                    Number(item.supplier_id) === Number(supplierId) &&
                    Number(item.product_id) === Number(focusedProductId) &&
                    item.status === "ACTIVE"
            )
            : null;

        setPurchaseForm({
            ...purchaseForm,
            supplier_id: supplierId,
            receiving_branch_id: purchaseForm.receiving_branch_id,
            items: focusedProductId
                ? [{
                    ...createEmptyPurchaseItem(),
                    product_id: String(focusedProductId),
                    quantity: purchaseForm.items[0]?.quantity || "",
                    purchase_price: selectedSupplierProduct
                        ? formatMoneyValue(selectedSupplierProduct.purchase_price)
                        : "",
                    lead_time_days: selectedSupplierProduct?.lead_time_days ?? "",
                }]
                : [createEmptyPurchaseItem()],
        });
    };

    const selectedProductIds = useMemo(() => {
        return purchaseForm.items
            .map((item) => Number(item.product_id))
            .filter(Boolean);
    }, [purchaseForm.items]);

    const purchaseTotal = useMemo(() => {
        return purchaseForm.items.reduce((sum, item) => {
            return sum + Number(item.quantity || 0) * Number(item.purchase_price || 0);
        }, 0);
    }, [purchaseForm.items]);

    const estimatedDeliveryDate = useMemo(() => {
        const leadTime = Math.max(
            0,
            ...purchaseForm.items.map((item) => Number(item.lead_time_days || 0))
        );
        if (!leadTime) return "-";

        const date = new Date();
        date.setDate(date.getDate() + leadTime);

        return date.toLocaleDateString("en-GB");
    }, [purchaseForm.items]);

    const updatePurchaseItem = (rowId, field, value) => {
        setPurchaseForm((current) => ({
            ...current,
            items: current.items.map((item) => {
                if (item.row_id !== rowId) return item;

                if (field === "product_id") {
                    const supplierProduct = supplierProductOptions.find(
                        (option) => Number(option.product_id) === Number(value)
                    );

                    return {
                        ...item,
                        product_id: value,
                        purchase_price: supplierProduct
                            ? formatMoneyValue(supplierProduct.purchase_price)
                            : "",
                        lead_time_days: supplierProduct?.lead_time_days ?? "",
                    };
                }

                return { ...item, [field]: value };
            }),
        }));
    };

    const addPurchaseItemRow = () => {
        setPurchaseForm((current) => ({
            ...current,
            items: [...current.items, createEmptyPurchaseItem()],
        }));
    };

    const removePurchaseItemRow = (rowId) => {
        setPurchaseForm((current) => ({
            ...current,
            items: current.items.length === 1
                ? [createEmptyPurchaseItem()]
                : current.items.filter((item) => item.row_id !== rowId),
        }));
    };

    const createPurchase = async (e) => {
        e.preventDefault();

        if (!purchaseForm.supplier_id) return showToast("Supplier is required.", "error");
        if (!warehouseLocation?.branch_id) return showToast("Receiving warehouse is required.", "error");
        if (purchaseForm.items.length === 0) return showToast("At least one product item is required.", "error");

        const productIds = [];
        for (const item of purchaseForm.items) {
            if (!item.product_id) return showToast("Product is required for every row.", "error");
            if (!item.quantity || Number(item.quantity) <= 0) return showToast("Quantity must be greater than 0.", "error");
            if (item.purchase_price === "" || Number(item.purchase_price) < 0) {
                return showToast("Purchase price cannot be negative.", "error");
            }
            if (productIds.includes(Number(item.product_id))) {
                return showToast("Duplicate products are not allowed in the same purchase order.", "error");
            }
            productIds.push(Number(item.product_id));
        }

        try {
            setSaving(true);

            const res = await fetch(`${API_BASE}/admin/purchases`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supplier_id: Number(purchaseForm.supplier_id),
                    receiving_branch_id: Number(warehouseLocation.branch_id),
                    notes: purchaseForm.notes.trim(),
                    created_by: user.user_id,
                    items: purchaseForm.items.map((item) => ({
                        product_id: Number(item.product_id),
                        quantity: Number(item.quantity),
                        purchase_price: Number(item.purchase_price),
                        lead_time_days: item.lead_time_days ? Number(item.lead_time_days) : null,
                    })),
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

    async function openPurchaseDetail(purchaseId) {
        try {
            const res = await fetch(`${API_BASE}/admin/purchases/${purchaseId}`);
            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to load purchase details.", "error");
                return;
            }

            setSelectedPurchase(data);
            setShowDetailModal(true);
        } catch (error) {
            console.error(error);
            showToast("Failed to load purchase details.", "error");
        }
    }

    const markAsOrdered = async (purchaseId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/purchases/${purchaseId}/ordered`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actor_user_id: user.user_id }),
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actor_user_id: user.user_id }),
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actor_user_id: user.user_id }),
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

    const canCommunicateWithSupplier = (purchase) => purchase?.status !== "CANCELLED";

    const copyToClipboard = async (value, successMessage) => {
        if (!value) return showToast("No contact information available.", "error");

        try {
            if (!navigator.clipboard) {
                showToast(value, "success");
                return;
            }

            await navigator.clipboard.writeText(value);
            showToast(successMessage);
        } catch (error) {
            console.error(error);
            showToast(value, "success");
        }
    };

    const callSupplier = async () => {
        const phone = selectedPurchase?.supplier_phone;
        if (!phone) return showToast("Supplier phone number is not available.", "error");

        window.location.href = `tel:${phone}`;
        await copyToClipboard(phone, "Supplier phone number copied.");
    };

    const formatWhatsAppPhone = (phone) => {
        const digits = String(phone || "").replace(/\D/g, "");
        if (!digits) return "";

        if (digits.startsWith("0")) {
            return `60${digits.slice(1)}`;
        }

        return digits;
    };

    const buildProductListText = (purchase) => {
        return (purchase.details || [])
            .map((item) => (
                `${item.product_name}\n\n` +
                `* Quantity: ${item.quantity}\n` +
                `* Unit Cost: ${formatCurrency(item.unit_cost)}`
            ))
            .join("\n\n");
    };

    const buildPurchaseEmailBody = (purchase) => {
        const productList = buildProductListText(purchase);

        return [
            `Dear ${purchase.supplier_name || "Supplier"},`,
            "",
            "We would like to confirm the following purchase order from RetailPulse.",
            "",
            `Purchase Order: ${purchase.purchase_code}`,
            `Purchase Date: ${purchase.purchase_date?.slice(0, 10) || "-"}`,
            `Receiving Location: ${purchase.branch_name || "Warehouse"}`,
            "",
            "Order Items:",
            productList || "-",
            "",
            `Total Amount: ${formatCurrency(purchase.total_amount)}`,
            "",
            "Please confirm product availability and estimated delivery schedule.",
            "",
            "Thank you.",
            "",
            "Best Regards,",
            "RetailPulse Procurement Team",
        ].join("\n");
    };

    const buildPurchaseWhatsAppMessage = (purchase) => {
        const productList = buildProductListText(purchase);

        return [
            `Hello ${purchase.supplier_name || "Supplier"}, this is RetailPulse Procurement Team.`,
            "",
            `We would like to confirm Purchase Order ${purchase.purchase_code}.`,
            "",
            "Order Items:",
            productList || "-",
            "",
            `Total Amount: ${formatCurrency(purchase.total_amount)}`,
            "",
            "Please confirm product availability and estimated delivery schedule. Thank you.",
        ].join("\n");
    };

    const whatsAppSupplier = () => {
        const phone = formatWhatsAppPhone(selectedPurchase?.supplier_phone);
        if (!phone) return showToast("Supplier phone number is not available.", "error");

        const message = buildPurchaseWhatsAppMessage(selectedPurchase);
        window.open(
            `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
            "_blank",
            "noopener,noreferrer"
        );
    };

    const emailSupplier = () => {
        const email = selectedPurchase?.supplier_email;
        if (!email) return showToast("Supplier email address is not available.", "error");

        const subject = `RetailPulse Purchase Order Confirmation - ${selectedPurchase.purchase_code}`;
        const body = buildPurchaseEmailBody(selectedPurchase);
        window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

                        <ProductsNotPurchasedPanel
                            products={productsNotPurchased}
                            onCreatePurchase={openFirstPurchaseForProduct}
                        />

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
                            onChange={updatePurchaseSupplier}
                            options={supplierSelectOptions}
                        />

                        {focusedProductSupplierOffers.length > 0 && (
                            <div className="rounded-2xl bg-[#f8fcff] p-4">
                                <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">Supplier Offers For Selected Product</p>
                                <div className="mt-3 space-y-2">
                                    {focusedProductSupplierOffers.slice(0, 3).map((offer) => (
                                        <div key={`${offer.supplier_id}-${offer.product_id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                                            <div>
                                                <p className="font-extrabold text-[#17325c]">{offer.supplier_name}</p>
                                                <p className="text-xs font-bold text-[#6f85a3]">
                                                    {offer.product_name} | {offer.lead_time_days || "-"} day lead time
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-[#0c2f73]">{formatCurrency(offer.purchase_price)}</p>
                                                {Number(offer.purchase_price || 0) === lowestFocusedOfferPrice && (
                                                    <p className="text-xs font-extrabold uppercase text-green-600">Lowest Offer</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedSupplier && <SupplierContactSummary supplier={selectedSupplier} />}

                        <ReadOnlyField
                            label="Receiving Location"
                            value={warehouseLocation?.branch_name || "Warehouse"}
                        />

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

                        <div className="rounded-2xl border border-blue-50 bg-white">
                            <div className="flex items-center justify-between border-b border-blue-50 px-4 py-3">
                                <h3 className="font-extrabold text-[#07102f]">Purchase Items</h3>
                                <button
                                    type="button"
                                    onClick={addPurchaseItemRow}
                                    disabled={!purchaseForm.supplier_id || purchaseForm.items.length >= supplierProductOptions.length}
                                    className="flex items-center gap-2 rounded-xl bg-[#eef6fb] px-3 py-2 text-xs font-extrabold text-[#1e4db7] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Plus size={15} />
                                    Add Product
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-left text-sm">
                                    <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                                        <tr>
                                            <th className="px-4 py-3">Product</th>
                                            <th className="px-4 py-3">Quantity</th>
                                            <th className="px-4 py-3">Purchase Price</th>
                                            <th className="px-4 py-3">Lead Time</th>
                                            <th className="px-4 py-3">Subtotal</th>
                                            <th className="px-4 py-3 text-right">Remove</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchaseForm.items.map((item) => {
                                            const subtotal = Number(item.quantity || 0) * Number(item.purchase_price || 0);

                                            return (
                                                <tr key={item.row_id} className="border-t bg-white">
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={item.product_id}
                                                            onChange={(e) => updatePurchaseItem(item.row_id, "product_id", e.target.value)}
                                                            disabled={Boolean(focusedProductId)}
                                                            className="w-full rounded-2xl bg-[#eef6fb] px-3 py-2 font-semibold text-[#17325c] outline-none"
                                                        >
                                                            <option value="">
                                                                {purchaseForm.supplier_id ? "Select Product" : "Select Supplier First"}
                                                            </option>
                                                            {focusedProductId && item.product_id && !supplierProductOptions.some((option) => Number(option.product_id) === Number(item.product_id)) && (
                                                                <option value={item.product_id}>
                                                                    {focusedProductSupplierOffers[0]?.product_name || "Selected Product"}
                                                                </option>
                                                            )}
                                                            {supplierProductOptions
                                                                .filter((option) =>
                                                                    !selectedProductIds.includes(Number(option.product_id)) ||
                                                                    Number(option.product_id) === Number(item.product_id)
                                                                )
                                                                .map((option) => (
                                                                    <option key={option.product_id} value={option.product_id}>
                                                                        {option.product_name}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updatePurchaseItem(item.row_id, "quantity", e.target.value)}
                                                            placeholder="20"
                                                            className="w-24 rounded-2xl bg-[#eef6fb] px-3 py-2 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={item.purchase_price}
                                                            onChange={(e) =>
                                                                updatePurchaseItem(
                                                                    item.row_id,
                                                                    "purchase_price",
                                                                    formatCentsInput(e.target.value)
                                                                )
                                                            }
                                                            placeholder="0.00"
                                                            className="w-32 rounded-2xl bg-[#eef6fb] px-3 py-2 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-[#17325c]">
                                                        {item.lead_time_days ? `${item.lead_time_days} Days` : "-"}
                                                    </td>
                                                    <td className="px-4 py-3 font-extrabold text-[#0c2f73]">
                                                        {formatCurrency(subtotal)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => removePurchaseItemRow(item.row_id)}
                                                            className="ml-auto grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                                                        >
                                                            <X size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-2xl bg-[#f8fcff] p-4">
                            <h3 className="mb-4 font-extrabold text-[#07102f]">Purchase Summary</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <InfoItem label="Items" value={purchaseForm.items.length} />
                                <InfoItem label="Receiving Location" value={warehouseLocation?.branch_name || "Warehouse"} />
                                <InfoItem label="Total Purchase Amount" value={formatCurrency(purchaseTotal)} />
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
                        <InfoItem label="Total Amount" value={formatCurrency(selectedPurchase.total_amount)} />
                        <InfoItem label="Status" value={selectedPurchase.status} />
                        <InfoItem label="Purchase Date" value={selectedPurchase.purchase_date?.slice(0, 10)} />
                    </div>

                    <SupplierInformationCard
                        purchase={selectedPurchase}
                        canCommunicate={canCommunicateWithSupplier(selectedPurchase)}
                        onCall={callSupplier}
                        onWhatsApp={whatsAppSupplier}
                        onEmail={emailSupplier}
                    />

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
                            <td className="px-4 py-4 font-extrabold text-[#0c2f73]">{formatCurrency(item.total_amount)}</td>
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

function ProductsNotPurchasedPanel({ products, onCreatePurchase }) {
    if (!products.length) return null;

    return (
        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-xl font-extrabold text-[#07102f]">Products Not Yet Purchased</h2>
                    <p className="mt-1 text-sm text-[#6f85a3]">
                        Create the first supplier purchase order for newly added products.
                    </p>
                </div>
                <span className="w-fit rounded-full bg-[#eef6fb] px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-[#1e4db7]">
                    {products.length} ready
                </span>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                {products.map((product) => (
                    <div
                        key={product.product_id}
                        className="rounded-2xl border border-blue-50 bg-[#f8fcff] p-4"
                    >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <p className="truncate font-extrabold text-[#17325c]">
                                    {product.product_name}
                                </p>
                                <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                    {product.product_code || `PID-${product.product_id}`} | {product.category_name}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-[#6f85a3]">
                                    Supplier: <span className="font-extrabold text-[#17325c]">{product.supplier_name}</span>
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                                <div className="text-right">
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                                        Purchase Price
                                    </p>
                                    <p className="font-extrabold text-[#0c2f73]">
                                        {formatCurrency(product.purchase_price)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onCreatePurchase(product)}
                                    className="rounded-2xl bg-[#0c2f73] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#103986]"
                                >
                                    Create Purchase
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function SupplierInformationCard({ purchase, canCommunicate, onCall, onWhatsApp, onEmail }) {
    return (
        <div className="mb-5 rounded-2xl border border-blue-50 bg-white p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h3 className="font-extrabold text-[#07102f]">Supplier Information</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <InfoItem label="Supplier Name" value={purchase.supplier_name} />
                        <InfoItem label="Contact Person" value={purchase.supplier_contact_person} />
                        <InfoItem label="Phone Number" value={purchase.supplier_phone} />
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">Email Address</p>
                            {purchase.supplier_email ? (
                                <a
                                    href={`mailto:${purchase.supplier_email}`}
                                    className="mt-1 block break-all font-extrabold text-[#1e4db7] hover:underline"
                                >
                                    {purchase.supplier_email}
                                </a>
                            ) : (
                                <p className="mt-1 font-extrabold text-[#17325c]">-</p>
                            )}
                        </div>
                    </div>
                </div>

                {canCommunicate && (
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-col">
                        <button
                            type="button"
                            onClick={onCall}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#eef6fb] px-4 py-3 text-sm font-extrabold text-[#1e4db7] hover:bg-blue-100 lg:w-44"
                        >
                            <Phone size={16} />
                            Call Supplier
                        </button>
                        <button
                            type="button"
                            onClick={onWhatsApp}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm font-extrabold text-green-600 hover:bg-green-100 lg:w-44"
                        >
                            <MessageCircle size={16} />
                            WhatsApp Supplier
                        </button>
                        <button
                            type="button"
                            onClick={onEmail}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0c2f73] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#103986] lg:w-44"
                        >
                            <Mail size={16} />
                            Email Supplier
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function SupplierContactSummary({ supplier }) {
    return (
        <div className="rounded-2xl border border-blue-50 bg-[#f8fcff] p-4">
            <h3 className="font-extrabold text-[#07102f]">Supplier Contact</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <InfoItem label="Contact Person" value={supplier.contact_person} />
                <InfoItem label="Phone Number" value={supplier.phone} />
                <div className="sm:col-span-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">Email Address</p>
                    {supplier.email ? (
                        <a
                            href={`mailto:${supplier.email}`}
                            className="mt-1 block break-all font-extrabold text-[#1e4db7] hover:underline"
                        >
                            {supplier.email}
                        </a>
                    ) : (
                        <p className="mt-1 font-extrabold text-[#17325c]">-</p>
                    )}
                </div>
            </div>
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
                        <th className="px-4 py-3">Lead Time</th>
                        <th className="px-4 py-3">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {details.map((item) => (
                        <tr key={item.purchase_detail_id} className="border-t bg-white">
                            <td className="px-4 py-4 font-extrabold text-[#17325c]">{item.product_name}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.quantity}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{formatCurrency(item.unit_cost)}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.lead_time_days ? `${item.lead_time_days} day(s)` : "-"}</td>
                            <td className="px-4 py-4 font-extrabold text-[#0c2f73]">{formatCurrency(item.subtotal)}</td>
                        </tr>
                    ))}

                    {details.length === 0 && (
                        <tr>
                            <td colSpan="5" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
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

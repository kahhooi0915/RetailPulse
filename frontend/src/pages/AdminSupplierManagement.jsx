import DashboardLayout from "../layouts/DashboardLayout";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Building2,
    Mail,
    Phone,
    Plus,
    Search,
    Pencil,
    Trash2,
    X,
    Users,
    Package,
    Link2,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "../utils/formatCurrency";
import { formatCentsInput, formatMoneyValue } from "../utils/moneyInput";

const API_BASE = "http://localhost:5000";

const emptySupplier = {
    supplier_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    status: "ACTIVE",
};

const emptySupplierProduct = {
    supplier_id: "",
    selectedProducts: [],
};

export default function AdminSupplierManagement() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [supplierProducts, setSupplierProducts] = useState([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [mappingSearchTerm, setMappingSearchTerm] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showSupplierForm, setShowSupplierForm] = useState(false);
    const [editSupplier, setEditSupplier] = useState(null);
    const [supplierForm, setSupplierForm] = useState(emptySupplier);

    const [showMappingForm, setShowMappingForm] = useState(false);
    const [supplierProductForm, setSupplierProductForm] = useState(emptySupplierProduct);
    const [editSupplierProduct, setEditSupplierProduct] = useState(null);
    const [supplierProductEditForm, setSupplierProductEditForm] = useState({
        purchase_price: "",
        lead_time_days: "",
        preferred_status: "NORMAL",
        status: "ACTIVE",
    });
    const [deleteSupplierProduct, setDeleteSupplierProduct] = useState(null);

    const [toast, setToast] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [settingsData, setSettingsData] = useState(() => {
        const savedSettings = sessionStorage.getItem("adminSettings");

        return savedSettings
            ? JSON.parse(savedSettings)
            : {
                compactMode: false,
                dashboardView: "Monthly",
            };
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

            const [supplierRes, productRes, supplierProductRes] = await Promise.all([
                fetch(`${API_BASE}/admin/suppliers`),
                fetch(`${API_BASE}/admin/products?available=1`),
                fetch(`${API_BASE}/admin/supplier-products`),
            ]);

            const supplierData = await supplierRes.json();
            const productData = await productRes.json();
            const supplierProductData = await supplierProductRes.json();

            setSuppliers(Array.isArray(supplierData) ? supplierData : []);
            setProducts(Array.isArray(productData) ? productData : []);
            setSupplierProducts(Array.isArray(supplierProductData) ? supplierProductData : []);
        } catch (error) {
            console.error(error);
            showToast("Failed to load supplier management data.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredSuppliers = useMemo(() => {
        const keyword = searchTerm.toLowerCase();

        return suppliers.filter((item) =>
            item.supplier_code?.toLowerCase().includes(keyword) ||
            item.supplier_name?.toLowerCase().includes(keyword) ||
            item.contact_person?.toLowerCase().includes(keyword) ||
            item.phone?.toLowerCase().includes(keyword) ||
            item.email?.toLowerCase().includes(keyword) ||
            item.status?.toLowerCase().includes(keyword)
        );
    }, [suppliers, searchTerm]);

    const filteredSupplierProducts = useMemo(() => {
        const keyword = mappingSearchTerm.toLowerCase();

        return supplierProducts.filter((item) =>
            item.supplier_name?.toLowerCase().includes(keyword) ||
            item.product_name?.toLowerCase().includes(keyword) ||
            item.status?.toLowerCase().includes(keyword)
        );
    }, [supplierProducts, mappingSearchTerm]);

    const activeSuppliers = suppliers.filter((item) => item.status === "ACTIVE").length;
    const inactiveSuppliers = suppliers.filter((item) => item.status === "INACTIVE").length;
    const assignedProducts = supplierProducts.filter((item) => item.status === "ACTIVE").length;

    const openAddSupplier = () => {
        setEditSupplier(null);
        setSupplierForm(emptySupplier);
        setShowSupplierForm(true);
    };

    const openEditSupplier = (supplier) => {
        setEditSupplier(supplier);
        setSupplierForm({
            supplier_name: supplier.supplier_name || "",
            contact_person: supplier.contact_person || "",
            phone: supplier.phone || "",
            email: supplier.email || "",
            address: supplier.address || "",
            status: supplier.status || "ACTIVE",
        });
        setShowSupplierForm(true);
    };

    const openAssignProduct = () => {
        setSupplierProductForm(emptySupplierProduct);
        setShowMappingForm(true);
    };

    const openEditSupplierProduct = (mapping) => {
        setEditSupplierProduct(mapping);
        setSupplierProductEditForm({
            purchase_price: formatMoneyValue(mapping.purchase_price),
            lead_time_days: mapping.lead_time_days ?? "",
            preferred_status: mapping.is_preferred ? "PREFERRED" : "NORMAL",
            status: mapping.status || "ACTIVE",
        });
    };

    const toggleSelectedProduct = (product) => {
        const productId = Number(product.product_id);

        const exists = supplierProductForm.selectedProducts.some(
            (item) => Number(item.product_id) === productId
        );

        if (exists) {
            setSupplierProductForm({
                ...supplierProductForm,
                selectedProducts: supplierProductForm.selectedProducts.filter(
                    (item) => Number(item.product_id) !== productId
                ),
            });
        } else {
            setSupplierProductForm({
                ...supplierProductForm,
                selectedProducts: [
                    ...supplierProductForm.selectedProducts,
                    {
                        product_id: productId,
                        product_code: product.product_code,
                        product_name: product.product_name,
                        purchase_price: "",
                        lead_time_days: "",
                        is_preferred: false,
                        status: "ACTIVE",
                    },
                ],
            });
        }
    };

    const updateSelectedProductField = (productId, field, value) => {
        setSupplierProductForm({
            ...supplierProductForm,
            selectedProducts: supplierProductForm.selectedProducts.map((item) =>
                Number(item.product_id) === Number(productId)
                    ? { ...item, [field]: value }
                    : item
            ),
        });
    };

    const saveSupplier = async (e) => {
        e.preventDefault();

        if (!supplierForm.supplier_name.trim()) {
            showToast("Supplier name is required.", "error");
            return;
        }

        try {
            setSaving(true);

            const url = editSupplier
                ? `${API_BASE}/admin/suppliers/${editSupplier.supplier_id}`
                : `${API_BASE}/admin/suppliers`;

            const method = editSupplier ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...supplierForm,
                    actor_user_id: user.user_id,
                    supplier_name: supplierForm.supplier_name.trim(),
                    contact_person: supplierForm.contact_person.trim(),
                    phone: supplierForm.phone.trim(),
                    email: supplierForm.email.trim(),
                    address: supplierForm.address.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to save supplier.", "error");
                return;
            }

            showToast(editSupplier ? "Supplier updated successfully." : "Supplier added successfully.");
            setShowSupplierForm(false);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to save supplier.", "error");
        } finally {
            setSaving(false);
        }
    };

    const saveSupplierProduct = async (e) => {
        e.preventDefault();

        if (!supplierProductForm.supplier_id) {
            showToast("Supplier is required.", "error");
            return;
        }

        if (supplierProductForm.selectedProducts.length === 0) {
            showToast("Please select at least one product.", "error");
            return;
        }

        for (const item of supplierProductForm.selectedProducts) {
            if (item.purchase_price === "" || Number(item.purchase_price) <= 0) {
                showToast(`Purchase price must be greater than 0 for ${item.product_name}.`, "error");
                return;
            }

            if (item.lead_time_days === "" || Number(item.lead_time_days) <= 0) {
                showToast(`Lead time must be greater than 0 for ${item.product_name}.`, "error");
                return;
            }
        }

        try {
            setSaving(true);

            const items = supplierProductForm.selectedProducts.map((item) => ({
                product_id: Number(item.product_id),
                purchase_price: Number(item.purchase_price),
                lead_time_days: Number(item.lead_time_days),
                is_preferred: item.is_preferred,
                status: item.status,
            }));

            const res = await fetch(`${API_BASE}/admin/supplier-products/bulk`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    supplier_id: Number(supplierProductForm.supplier_id),
                    items,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(
                    data.message || "Failed to assign products to supplier.",
                    "error"
                );
                return;
            }

            showToast(
                `${data.inserted_count || 0} inserted, ${data.updated_count || 0} updated.`
            );

            setShowMappingForm(false);
            setSupplierProductForm(emptySupplierProduct);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to assign products.", "error");
        } finally {
            setSaving(false);
        }
    };

    const deleteSupplier = async (supplier) => {
        if (!window.confirm(`Deactivate ${supplier.supplier_name}?`)) return;

        try {
            const res = await fetch(`${API_BASE}/admin/suppliers/${supplier.supplier_id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actor_user_id: user.user_id }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to deactivate supplier.", "error");
                return;
            }

            showToast("Supplier deactivated successfully.");
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to deactivate supplier.", "error");
        }
    };

    const saveEditedSupplierProduct = async (e) => {
        e.preventDefault();

        if (Number(supplierProductEditForm.purchase_price) <= 0) {
            showToast("Purchase price must be greater than 0.", "error");
            return;
        }

        if (Number(supplierProductEditForm.lead_time_days) <= 0) {
            showToast("Lead time must be greater than 0.", "error");
            return;
        }

        try {
            setSaving(true);

            const res = await fetch(
                `${API_BASE}/admin/supplier-products/${editSupplierProduct.supplier_id}/${editSupplierProduct.product_id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        purchase_price: Number(supplierProductEditForm.purchase_price),
                        lead_time_days: Number(supplierProductEditForm.lead_time_days),
                        is_preferred: supplierProductEditForm.preferred_status === "PREFERRED",
                        status: supplierProductEditForm.status,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to update supplier-product mapping.", "error");
                return;
            }

            showToast("Supplier-product mapping updated successfully.");
            setEditSupplierProduct(null);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to update supplier-product mapping.", "error");
        } finally {
            setSaving(false);
        }
    };

    const confirmDeleteSupplierProduct = async () => {
        try {
            setSaving(true);

            const res = await fetch(
                `${API_BASE}/admin/supplier-products/${deleteSupplierProduct.supplier_id}/${deleteSupplierProduct.product_id}`,
                { method: "DELETE" }
            );

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to delete supplier-product mapping.", "error");
                return;
            }

            showToast("Supplier-product mapping removed successfully.");
            setDeleteSupplierProduct(null);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to delete supplier-product mapping.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <DashboardLayout
                user={user}
                title="Supplier Management"
                subtitle="Manage supplier contact details and assign supplied products."
                modelText={`Current View: ${settingsData.dashboardView}`}
                onRefresh={loadData}
                onOpenSettings={() => setShowSettings(true)}
                onOpenNotifications={() => setShowNotifications(true)}
                notificationCount={inactiveSuppliers}
                compactMode={settingsData.compactMode}
            >
                {loading ? (
                    <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
                        <div className="text-center">
                            <Building2 size={42} className="mx-auto mb-3" />
                            <p className="font-semibold">Loading Supplier Management...</p>
                        </div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        <section className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
                            <SummaryCard title="Total Suppliers" value={suppliers.length} icon={Building2} color="text-[#1e4db7]" />
                            <SummaryCard title="Active Suppliers" value={activeSuppliers} icon={Users} color="text-green-600" />
                            <SummaryCard title="Inactive Suppliers" value={inactiveSuppliers} icon={Building2} color="text-red-500" />
                            <SummaryCard title="Assigned Products" value={assignedProducts} icon={Package} color="text-[#07102f]" />
                        </section>

                        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        Supplier List
                                    </h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Store supplier details for manual phone or email purchasing.
                                    </p>
                                </div>

                                <button
                                    onClick={openAddSupplier}
                                    className="ml-auto flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                >
                                    <Plus size={17} />
                                    Add Supplier
                                </button>
                            </div>

                            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
                                <Search size={18} className="text-[#6f85a3]" />
                                <input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search supplier code, name, contact, phone, email, or status..."
                                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0bb]"
                                />
                            </div>

                            <SupplierTable
                                suppliers={filteredSuppliers}
                                onEdit={openEditSupplier}
                                onDelete={deleteSupplier}
                            />
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        Supplier Product Mapping
                                    </h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Assign which products each supplier can supply, including purchase price and lead time.
                                    </p>
                                </div>

                                <button
                                    onClick={openAssignProduct}
                                    className="ml-auto flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                >
                                    <Link2 size={17} />
                                    Assign Product
                                </button>
                            </div>

                            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
                                <Search size={18} className="text-[#6f85a3]" />
                                <input
                                    value={mappingSearchTerm}
                                    onChange={(e) => setMappingSearchTerm(e.target.value)}
                                    placeholder="Search supplier, product, or status..."
                                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0bb]"
                                />
                            </div>

                            <SupplierProductTable
                                supplierProducts={filteredSupplierProducts}
                                onEdit={openEditSupplierProduct}
                                onDelete={setDeleteSupplierProduct}
                            />
                        </section>
                    </motion.div>
                )}
            </DashboardLayout>

            {showSupplierForm && (
                <Modal
                    title={editSupplier ? "Update Supplier" : "Add Supplier"}
                    subtitle="Supplier information will be used when creating purchase orders."
                    onClose={() => setShowSupplierForm(false)}
                >
                    <form onSubmit={saveSupplier} className="space-y-5">
                        <FormInput label="Supplier Name" value={supplierForm.supplier_name} onChange={(value) => setSupplierForm({ ...supplierForm, supplier_name: value })} placeholder="Example: ABC Beverage Trading Sdn Bhd" />
                        <FormInput label="Contact Person" value={supplierForm.contact_person} onChange={(value) => setSupplierForm({ ...supplierForm, contact_person: value })} placeholder="Example: Mr Tan" />

                        <div className="grid grid-cols-2 gap-4">
                            <FormInput label="Phone" value={supplierForm.phone} onChange={(value) => setSupplierForm({ ...supplierForm, phone: value })} placeholder="0123456789" />
                            <FormInput label="Email" type="email" value={supplierForm.email} onChange={(value) => setSupplierForm({ ...supplierForm, email: value })} placeholder="sales@supplier.com" />
                        </div>

                        <FormTextarea label="Address" value={supplierForm.address} onChange={(value) => setSupplierForm({ ...supplierForm, address: value })} placeholder="Supplier address..." />

                        <FormSelect
                            label="Status"
                            value={supplierForm.status}
                            onChange={(value) => setSupplierForm({ ...supplierForm, status: value })}
                            options={[
                                { value: "ACTIVE", label: "Active" },
                                { value: "INACTIVE", label: "Inactive" },
                            ]}
                        />

                        <FormActions saving={saving} saveText={editSupplier ? "Update Supplier" : "Add Supplier"} onCancel={() => setShowSupplierForm(false)} />
                    </form>
                </Modal>
            )}

            {showMappingForm && (
                <Modal
                    title="Assign Products to Supplier"
                    subtitle="Select one supplier and enter purchase details for each product."
                    onClose={() => setShowMappingForm(false)}
                    wide
                >
                    <form onSubmit={saveSupplierProduct} className="space-y-5">
                        <FormSelect
                            label="Supplier"
                            value={supplierProductForm.supplier_id}
                            onChange={(value) =>
                                setSupplierProductForm({
                                    ...supplierProductForm,
                                    supplier_id: value,
                                })
                            }
                            options={[
                                { value: "", label: "Select Supplier" },
                                ...suppliers
                                    .filter((item) => item.status === "ACTIVE")
                                    .map((item) => ({
                                        value: item.supplier_id,
                                        label: `${item.supplier_code} - ${item.supplier_name}`,
                                    })),
                            ]}
                        />

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label className="block text-sm font-bold text-[#17325c]">
                                    Products Supplied
                                </label>

                                <span className="text-xs font-extrabold text-[#1e4db7]">
                                    {supplierProductForm.selectedProducts.length} selected
                                </span>
                            </div>

                            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl bg-[#eef6fb] p-4">
                                {products
                                    .filter((item) => item.status === "ACTIVE")
                                    .map((product) => {
                                        const selectedItem = supplierProductForm.selectedProducts.find(
                                            (item) => Number(item.product_id) === Number(product.product_id)
                                        );

                                        const checked = Boolean(selectedItem);

                                        return (
                                            <div
                                                key={product.product_id}
                                                className="rounded-xl bg-white px-4 py-4"
                                            >
                                                <label className="flex cursor-pointer items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleSelectedProduct(product)}
                                                        className="h-4 w-4 accent-[#0c2f73]"
                                                    />

                                                    <div>
                                                        <p className="font-bold text-[#17325c]">
                                                            {product.product_name}
                                                        </p>
                                                        <p className="text-xs font-semibold text-[#6f85a3]">
                                                            {product.product_code}
                                                        </p>
                                                    </div>
                                                </label>

                                                {checked && (
                                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                                                        <div>
                                                            <label className="mb-1 block text-xs font-bold text-[#6f85a3]">
                                                                Purchase Price
                                                            </label>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={selectedItem.purchase_price}
                                                                onChange={(e) =>
                                                                    updateSelectedProductField(
                                                                        product.product_id,
                                                                        "purchase_price",
                                                                        formatCentsInput(e.target.value)
                                                                    )
                                                                }
                                                                placeholder="0.00"
                                                                className="w-full rounded-xl bg-[#eef6fb] px-3 py-2 text-sm font-semibold outline-none"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="mb-1 block text-xs font-bold text-[#6f85a3]">
                                                                Lead Time
                                                            </label>
                                                            <input
                                                                type="number"
                                                                value={selectedItem.lead_time_days}
                                                                onChange={(e) =>
                                                                    updateSelectedProductField(
                                                                        product.product_id,
                                                                        "lead_time_days",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                placeholder="7"
                                                                className="w-full rounded-xl bg-[#eef6fb] px-3 py-2 text-sm font-semibold outline-none"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="mb-1 block text-xs font-bold text-[#6f85a3]">
                                                                Status
                                                            </label>
                                                            <select
                                                                value={selectedItem.status}
                                                                onChange={(e) =>
                                                                    updateSelectedProductField(
                                                                        product.product_id,
                                                                        "status",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                className="w-full rounded-xl bg-[#eef6fb] px-3 py-2 text-sm font-semibold outline-none"
                                                            >
                                                                <option value="ACTIVE">Active</option>
                                                                <option value="INACTIVE">Inactive</option>
                                                            </select>
                                                        </div>

                                                        <div className="flex items-end justify-between gap-3 rounded-xl bg-[#f8fcff] px-3 py-2">
                                                            <div>
                                                                <p className="text-xs font-bold text-[#17325c]">
                                                                    Preferred
                                                                </p>
                                                                <p className="text-[11px] font-semibold text-[#6f85a3]">
                                                                    Prioritize
                                                                </p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateSelectedProductField(
                                                                        product.product_id,
                                                                        "is_preferred",
                                                                        !selectedItem.is_preferred
                                                                    )
                                                                }
                                                                className={`relative h-6 w-12 rounded-full transition ${selectedItem.is_preferred
                                                                        ? "bg-[#1e4db7]"
                                                                        : "bg-gray-300"
                                                                    }`}
                                                            >
                                                                <div
                                                                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${selectedItem.is_preferred
                                                                            ? "left-7"
                                                                            : "left-1"
                                                                        }`}
                                                                />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                {products.filter((item) => item.status === "ACTIVE").length === 0 && (
                                    <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#6f85a3]">
                                        No active products available.
                                    </p>
                                )}
                            </div>
                        </div>

                        <FormActions saving={saving} saveText="Save Supplier Products" onCancel={() => setShowMappingForm(false)} />
                    </form>
                </Modal>
            )}

            {editSupplierProduct && (
                <Modal
                    title="Edit Supplier Product Mapping"
                    subtitle="Update purchase terms for this supplier-product relationship."
                    onClose={() => setEditSupplierProduct(null)}
                >
                    <form onSubmit={saveEditedSupplierProduct} className="space-y-5">
                        <ReadOnlyField label="Supplier" value={editSupplierProduct.supplier_name} />
                        <ReadOnlyField label="Product" value={editSupplierProduct.product_name} />

                        <div className="grid grid-cols-2 gap-4">
                            <MoneyInput
                                label="Purchase Price"
                                value={supplierProductEditForm.purchase_price}
                                onChange={(value) =>
                                    setSupplierProductEditForm({
                                        ...supplierProductEditForm,
                                        purchase_price: value,
                                    })
                                }
                                placeholder="10.00"
                            />
                            <FormInput
                                label="Lead Time (Days)"
                                type="number"
                                value={supplierProductEditForm.lead_time_days}
                                onChange={(value) =>
                                    setSupplierProductEditForm({
                                        ...supplierProductEditForm,
                                        lead_time_days: value,
                                    })
                                }
                                placeholder="3"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormSelect
                                label="Preferred Supplier"
                                value={supplierProductEditForm.preferred_status}
                                onChange={(value) =>
                                    setSupplierProductEditForm({
                                        ...supplierProductEditForm,
                                        preferred_status: value,
                                    })
                                }
                                options={[
                                    { value: "PREFERRED", label: "Preferred" },
                                    { value: "NORMAL", label: "Normal" },
                                ]}
                            />
                            <FormSelect
                                label="Status"
                                value={supplierProductEditForm.status}
                                onChange={(value) =>
                                    setSupplierProductEditForm({
                                        ...supplierProductEditForm,
                                        status: value,
                                    })
                                }
                                options={[
                                    { value: "ACTIVE", label: "Active" },
                                    { value: "INACTIVE", label: "Inactive" },
                                ]}
                            />
                        </div>

                        <FormActions saving={saving} saveText="Save Changes" onCancel={() => setEditSupplierProduct(null)} />
                    </form>
                </Modal>
            )}

            {deleteSupplierProduct && (
                <Modal
                    title="Remove Mapping"
                    subtitle="Are you sure you want to remove this supplier-product mapping?"
                    onClose={() => setDeleteSupplierProduct(null)}
                >
                    <div className="space-y-5">
                        <div className="rounded-2xl bg-[#f8fcff] p-4">
                            <p className="font-extrabold text-[#17325c]">{deleteSupplierProduct.supplier_name}</p>
                            <p className="mt-1 text-sm font-semibold text-[#6f85a3]">{deleteSupplierProduct.product_name}</p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteSupplierProduct(null)}
                                className="w-full rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#254e7a] hover:bg-blue-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteSupplierProduct}
                                disabled={saving}
                                className="w-full rounded-2xl bg-red-500 py-4 font-extrabold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? "Deleting..." : "Confirm Delete"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {showSettings && (
                <Modal title="Admin Settings" subtitle="Configure supplier management view options." onClose={() => setShowSettings(false)}>
                    <div className="space-y-6">
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
                            <h2 className="text-xl font-extrabold text-[#07102f]">
                                Notifications
                            </h2>

                            <button onClick={() => setShowNotifications(false)} className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]">
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <NotificationCard title="Inactive Suppliers" desc={`${inactiveSuppliers} inactive supplier record(s).`} color="orange" />
                            <NotificationCard title="Supplier Records" desc={`${suppliers.length} supplier(s) registered.`} color="blue" />
                            <NotificationCard title="Assigned Products" desc={`${assignedProducts} active supplier-product mapping(s).`} color="green" />
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

function SupplierTable({ suppliers, onEdit, onDelete }) {
    return (
        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Contact Person</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                </thead>

                <tbody>
                    {suppliers.map((item) => (
                        <tr key={item.supplier_id} className="border-t bg-white">
                            <td className="px-4 py-4">
                                <p className="font-extrabold text-[#17325c]">{item.supplier_name}</p>
                                <p className="mt-1 text-xs font-bold text-[#6f85a3]">{item.supplier_code || `SID-${item.supplier_id}`}</p>
                            </td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.contact_person || "-"}</td>
                            <td className="px-4 py-4">
                                <div className="flex items-center gap-2 font-semibold text-[#17325c]">
                                    <Phone size={15} className="text-[#1e4db7]" />
                                    {item.phone || "-"}
                                </div>
                            </td>
                            <td className="px-4 py-4">
                                <div className="flex items-center gap-2 font-semibold text-[#17325c]">
                                    <Mail size={15} className="text-[#1e4db7]" />
                                    {item.email || "-"}
                                </div>
                            </td>
                            <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                            <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                    <ActionButton icon={Pencil} onClick={() => onEdit(item)} />
                                    <ActionButton icon={Trash2} danger onClick={() => onDelete(item)} />
                                </div>
                            </td>
                        </tr>
                    ))}

                    {suppliers.length === 0 && (
                        <tr>
                            <td colSpan="6" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                No supplier records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function SupplierProductTable({ supplierProducts, onEdit, onDelete }) {
    return (
        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Purchase Price</th>
                        <th className="px-4 py-3">Lead Time</th>
                        <th className="px-4 py-3">Preferred</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                </thead>

                <tbody>
                    {supplierProducts.map((item) => (
                        <tr key={`${item.supplier_id}-${item.product_id}`} className="border-t bg-white">
                            <td className="px-4 py-4">
                                <p className="font-extrabold text-[#17325c]">{item.supplier_name}</p>
                            </td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.product_name}</td>
                            <td className="px-4 py-4 font-extrabold text-[#0c2f73]">{formatCurrency(item.purchase_price)}</td>
                            <td className="px-4 py-4 font-semibold text-[#17325c]">{item.lead_time_days ?? "-"} day(s)</td>
                            <td className="px-4 py-4">
                                {item.is_preferred ? (
                                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-[#1e4db7]">Preferred</span>
                                ) : (
                                    <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-extrabold text-gray-500">Normal</span>
                                )}
                            </td>
                            <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                            <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                    <ActionButton icon={Pencil} onClick={() => onEdit(item)} />
                                    <ActionButton icon={Trash2} danger onClick={() => onDelete(item)} />
                                </div>
                            </td>
                        </tr>
                    ))}

                    {supplierProducts.length === 0 && (
                        <tr>
                            <td colSpan="7" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                No supplier-product mapping found.
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
    return (
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${status === "ACTIVE" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
            {status}
        </span>
    );
}

function ActionButton({ icon: Icon, onClick, danger = false }) {
    return (
        <button onClick={onClick} className={`grid h-9 w-9 place-items-center rounded-xl ${danger ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100"}`}>
            <Icon size={16} />
        </button>
    );
}

function ReadOnlyField({ label, value }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <div className="w-full rounded-2xl bg-[#f8fcff] px-4 py-3 font-semibold text-[#6f85a3]">
                {value || "-"}
            </div>
        </div>
    );
}

function FormInput({ label, value, onChange, placeholder, type = "text" }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]" />
        </div>
    );
}

function MoneyInput({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) => onChange(formatCentsInput(e.target.value))}
                placeholder={placeholder}
                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
            />
        </div>
    );
}

function FormSelect({ label, value, onChange, options }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none">
                {options.map((item) => (
                    <option key={item.value} value={item.value}>
                        {item.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function FormTextarea({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">{label}</label>
            <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows="4" className="w-full resize-none rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]" />
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
            <div className={`max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl ${wide ? "w-[820px]" : "w-[560px]"}`}>
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

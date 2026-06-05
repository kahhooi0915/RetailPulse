import DashboardLayout from "../layouts/DashboardLayout";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Boxes,
    Search,
    Plus,
    Pencil,
    Trash2,
    X,
    Eye,
    Tag,
    Package,
    ImagePlus,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "../utils/formatCurrency";

const API_BASE = "http://localhost:5000";

const emptyCategory = {
    category_name: "",
    status: "ACTIVE",
};

const emptyProduct = {
    product_name: "",
    category_id: "",
    selling_price: "",
    reorder_level: "",
    status: "ACTIVE",
    description: "",
    product_image: null,
    suppliers: [],
};

const getProductImageUrl = (productId) => {
    return `${API_BASE}/admin/products/${productId}/image`;
};

export default function AdminCatalogManagement() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    const [activeTab, setActiveTab] = useState("products");
    const [searchTerm, setSearchTerm] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [showProductForm, setShowProductForm] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const [editCategory, setEditCategory] = useState(null);
    const [editProduct, setEditProduct] = useState(null);

    const [categoryForm, setCategoryForm] = useState(emptyCategory);
    const [productForm, setProductForm] = useState(emptyProduct);
    const [selectedImageName, setSelectedImageName] = useState("");

    const [toast, setToast] = useState(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [settingsData, setSettingsData] = useState(() => {
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

    useEffect(() => {
        const savedUser =
            JSON.parse(sessionStorage.getItem("user")) ||
            JSON.parse(sessionStorage.getItem("user"));

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

            const [categoryRes, productRes, supplierRes] = await Promise.all([
                fetch(`${API_BASE}/admin/categories`),
                fetch(`${API_BASE}/admin/products`),
                fetch(`${API_BASE}/admin/suppliers`),
            ]);

            const categoryData = await categoryRes.json();
            const productData = await productRes.json();
            const supplierData = await supplierRes.json();

            setCategories(Array.isArray(categoryData) ? categoryData : []);
            setProducts(Array.isArray(productData) ? productData : []);
            setSuppliers(Array.isArray(supplierData) ? supplierData : []);
        } catch (error) {
            console.error(error);
            showToast("Failed to load catalog data.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredCategories = useMemo(() => {
        const keyword = searchTerm.toLowerCase();

        return categories.filter((item) =>
            item.category_code?.toLowerCase().includes(keyword) ||
            item.category_name?.toLowerCase().includes(keyword) ||
            item.status?.toLowerCase().includes(keyword)
        );
    }, [categories, searchTerm]);

    const filteredProducts = useMemo(() => {
        const keyword = searchTerm.toLowerCase();

        return products.filter((item) =>
            item.product_code?.toLowerCase().includes(keyword) ||
            item.product_name?.toLowerCase().includes(keyword) ||
            item.category_name?.toLowerCase().includes(keyword) ||
            item.status?.toLowerCase().includes(keyword)
        );
    }, [products, searchTerm]);

    const activeCategories = categories.filter((item) => item.status === "ACTIVE").length;
    const inactiveProducts = products.filter((item) => item.status === "INACTIVE").length;

    const openAddCategory = () => {
        setEditCategory(null);
        setCategoryForm(emptyCategory);
        setShowCategoryForm(true);
    };

    const openEditCategory = (category) => {
        setEditCategory(category);
        setCategoryForm({
            category_name: category.category_name || "",
            status: category.status || "ACTIVE",
        });
        setShowCategoryForm(true);
    };

    const openAddProduct = () => {
        setEditProduct(null);
        setProductForm({ ...emptyProduct, suppliers: [] });
        setSelectedImageName("");
        setShowProductForm(true);
    };

    const openEditProduct = (product) => {
        setEditProduct(product);
        setProductForm({
            product_name: product.product_name || "",
            category_id: product.category_id ? String(product.category_id) : "",
            selling_price: product.selling_price ?? "",
            reorder_level: product.reorder_level ?? "",
            status: product.status || "ACTIVE",
            description: product.description || "",
            product_image: null,
            suppliers: (product.suppliers || []).map((supplier) => ({
                supplier_id: String(supplier.supplier_id),
                purchase_price: supplier.purchase_price ?? "",
                lead_time_days: supplier.lead_time_days ?? "",
            })),
        });
        setSelectedImageName("");
        setShowProductForm(true);
    };

    const updateProductSupplier = (supplierId, field, value) => {
        setProductForm((current) => {
            const exists = current.suppliers.some(
                (item) => Number(item.supplier_id) === Number(supplierId)
            );

            if (field === "selected") {
                return {
                    ...current,
                    suppliers: value
                        ? [
                            ...current.suppliers,
                            {
                                supplier_id: String(supplierId),
                                purchase_price: "",
                                lead_time_days: "",
                            },
                        ]
                        : current.suppliers.filter(
                            (item) => Number(item.supplier_id) !== Number(supplierId)
                        ),
                };
            }

            if (!exists) return current;

            return {
                ...current,
                suppliers: current.suppliers.map((item) =>
                    Number(item.supplier_id) === Number(supplierId)
                        ? { ...item, [field]: value }
                        : item
                ),
            };
        });
    };

    const saveCategory = async (e) => {
        e.preventDefault();

        if (!categoryForm.category_name.trim()) {
            showToast("Category name is required.", "error");
            return;
        }

        try {
            setSaving(true);

            const url = editCategory
                ? `${API_BASE}/admin/categories/${editCategory.category_id}`
                : `${API_BASE}/admin/categories`;

            const method = editCategory ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(categoryForm),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to save category.", "error");
                return;
            }

            showToast(editCategory ? "Category updated successfully." : "Category added successfully.");
            setShowCategoryForm(false);
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to save category.", "error");
        } finally {
            setSaving(false);
        }
    };

    const saveProduct = async (e) => {
        e.preventDefault();

        if (!productForm.product_name.trim()) return showToast("Product name is required.", "error");
        if (!productForm.category_id) return showToast("Category is required.", "error");
        if (productForm.selling_price === "") return showToast("Selling price is required.", "error");
        if (productForm.reorder_level === "") return showToast("Reorder level is required.", "error");
        if (Number(productForm.selling_price) < 0) return showToast("Selling price cannot be negative.", "error");
        if (Number(productForm.reorder_level) < 0) return showToast("Reorder level cannot be negative.", "error");
        if (productForm.suppliers.length === 0) return showToast("At least one supplier assignment is required.", "error");

        for (const supplier of productForm.suppliers) {
            if (supplier.purchase_price === "" || Number(supplier.purchase_price) < 0) {
                return showToast("Supplier purchase price must be greater than or equal to 0.", "error");
            }

            if (supplier.lead_time_days === "" || Number(supplier.lead_time_days) < 0) {
                return showToast("Supplier lead time days must be greater than or equal to 0.", "error");
            }
        }

        try {
            setSaving(true);

            const formData = new FormData();
            formData.append("product_name", productForm.product_name.trim());
            formData.append("category_id", productForm.category_id);
            formData.append("selling_price", productForm.selling_price);
            formData.append("reorder_level", productForm.reorder_level);
            formData.append("status", productForm.status);
            formData.append("description", productForm.description || "");
            formData.append("actor_user_id", user.user_id);
            formData.append("suppliers", JSON.stringify(
                productForm.suppliers.map((supplier) => ({
                    supplier_id: Number(supplier.supplier_id),
                    purchase_price: Number(supplier.purchase_price),
                    lead_time_days: Number(supplier.lead_time_days),
                }))
            ));

            if (productForm.product_image instanceof File) {
                formData.append("product_image", productForm.product_image);
            }

            const url = editProduct
                ? `${API_BASE}/admin/products/${editProduct.product_id}`
                : `${API_BASE}/admin/products`;

            const method = editProduct ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to save product.", "error");
                return;
            }

            showToast(editProduct ? "Product updated successfully." : "Product added successfully.");
            setShowProductForm(false);
            setSelectedImageName("");
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to save product.", "error");
        } finally {
            setSaving(false);
        }
    };

    const deleteCategory = async (category) => {
        if (!window.confirm(`Delete ${category.category_name}?`)) return;

        try {
            const res = await fetch(`${API_BASE}/admin/categories/${category.category_id}`, {
                method: "DELETE",
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to delete category.", "error");
                return;
            }

            showToast("Category deleted successfully.");
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to delete category.", "error");
        }
    };

    const deleteProduct = async (product) => {
        if (!window.confirm(`Delete ${product.product_name}?`)) return;

        try {
            const res = await fetch(`${API_BASE}/admin/products/${product.product_id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actor_user_id: user.user_id }),
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to delete product.", "error");
                return;
            }

            showToast("Product deleted successfully.");
            loadData();
        } catch (error) {
            console.error(error);
            showToast("Failed to delete product.", "error");
        }
    };

    return (
        <>
            <DashboardLayout
                user={user}
                title="Catalog Management"
                subtitle="Manage product categories and products used in POS and analytics."
                modelText={`Current View: ${settingsData.dashboardView}`}
                onRefresh={loadData}
                onOpenSettings={() => setShowSettings(true)}
                onOpenNotifications={() => setShowNotifications(true)}
                notificationCount={inactiveProducts}
                compactMode={settingsData.compactMode}
            >
                {loading ? (
                    <div className="grid min-h-[70vh] place-items-center text-[#6f85a3]">
                        <div className="text-center">
                            <Boxes size={42} className="mx-auto mb-3" />
                            <p className="font-semibold">Loading Catalog Management...</p>
                        </div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        <section className="mb-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
                            <SummaryCard title="Total Products" value={products.length} icon={Package} color="text-[#1e4db7]" />
                            <SummaryCard title="Total Categories" value={categories.length} icon={Tag} color="text-[#07102f]" />
                            <SummaryCard title="Active Categories" value={activeCategories} icon={Tag} color="text-green-600" />
                            <SummaryCard title="Inactive Products" value={inactiveProducts} icon={Package} color="text-red-500" />
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                <div>
                                    <h2 className="text-xl font-extrabold text-[#07102f]">
                                        Product Catalog
                                    </h2>
                                    <p className="mt-1 text-sm text-[#6f85a3]">
                                        Edit catalog data and preview how products appear for POS selection.
                                    </p>
                                </div>

                                <div className="ml-auto flex gap-3">
                                    <button
                                        onClick={() => setShowPreview(true)}
                                        className="flex items-center gap-2 rounded-2xl bg-[#eef6fb] px-5 py-3 text-sm font-extrabold text-[#0c2f73] hover:bg-blue-100"
                                    >
                                        <Eye size={17} />
                                        Preview POS Catalog
                                    </button>

                                    <button
                                        onClick={activeTab === "products" ? openAddProduct : openAddCategory}
                                        className="flex items-center gap-2 rounded-2xl bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                                    >
                                        <Plus size={17} />
                                        {activeTab === "products" ? "Add Product" : "Add Category"}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-6 flex flex-col gap-4 xl:flex-row">
                                <div className="flex rounded-2xl bg-[#eef6fb] p-1">
                                    <button
                                        onClick={() => setActiveTab("products")}
                                        className={`rounded-xl px-5 py-3 text-sm font-extrabold ${activeTab === "products"
                                                ? "bg-white text-[#0c2f73] shadow"
                                                : "text-[#6f85a3]"
                                            }`}
                                    >
                                        Products
                                    </button>

                                    <button
                                        onClick={() => setActiveTab("categories")}
                                        className={`rounded-xl px-5 py-3 text-sm font-extrabold ${activeTab === "categories"
                                                ? "bg-white text-[#0c2f73] shadow"
                                                : "text-[#6f85a3]"
                                            }`}
                                    >
                                        Categories
                                    </button>
                                </div>

                                <div className="flex flex-1 items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
                                    <Search size={18} className="text-[#6f85a3]" />
                                    <input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search code, name, category, or status..."
                                        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0bb]"
                                    />
                                </div>
                            </div>

                            {activeTab === "products" ? (
                                <ProductTable
                                    products={filteredProducts}
                                    onEdit={openEditProduct}
                                    onDelete={deleteProduct}
                                />
                            ) : (
                                <CategoryTable
                                    categories={filteredCategories}
                                    onEdit={openEditCategory}
                                    onDelete={deleteCategory}
                                />
                            )}
                        </section>
                    </motion.div>
                )}
            </DashboardLayout>

            {showCategoryForm && (
                <Modal
                    title={editCategory ? "Update Category" : "Add Category"}
                    subtitle="Category controls product grouping in POS and analytics."
                    onClose={() => setShowCategoryForm(false)}
                >
                    <form onSubmit={saveCategory} className="space-y-5">
                        <FormInput
                            label="Category Name"
                            value={categoryForm.category_name}
                            onChange={(value) =>
                                setCategoryForm({ ...categoryForm, category_name: value })
                            }
                            placeholder="Example: Food & Beverage"
                        />

                        <FormSelect
                            label="Status"
                            value={categoryForm.status}
                            onChange={(value) =>
                                setCategoryForm({ ...categoryForm, status: value })
                            }
                            options={[
                                { value: "ACTIVE", label: "Active" },
                                { value: "INACTIVE", label: "Inactive" },
                            ]}
                        />

                        <FormActions
                            saving={saving}
                            saveText={editCategory ? "Update Category" : "Add Category"}
                            onCancel={() => setShowCategoryForm(false)}
                        />
                    </form>
                </Modal>
            )}

            {showProductForm && (
                <Modal
                    title={editProduct ? "Update Product" : "Add Product"}
                    subtitle="Product data will be used by POS, inventory, and analytics."
                    onClose={() => setShowProductForm(false)}
                    wide
                >
                    <form onSubmit={saveProduct} className="space-y-5">
                        <FormInput
                            label="Product Name"
                            value={productForm.product_name}
                            onChange={(value) =>
                                setProductForm({ ...productForm, product_name: value })
                            }
                            placeholder="Example: Mineral Water 500ml"
                        />

                        <FormSelect
                            label="Category"
                            value={productForm.category_id}
                            onChange={(value) =>
                                setProductForm({ ...productForm, category_id: value })
                            }
                            options={[
                                { value: "", label: "Select Category" },
                                ...categories.map((item) => ({
                                    value: item.category_id,
                                    label: item.category_name,
                                })),
                            ]}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormInput
                                label="Selling Price"
                                type="number"
                                value={productForm.selling_price}
                                onChange={(value) =>
                                    setProductForm({ ...productForm, selling_price: value })
                                }
                                placeholder="0.00"
                            />

                            <FormInput
                                label="Reorder Level"
                                type="number"
                                value={productForm.reorder_level}
                                onChange={(value) =>
                                    setProductForm({ ...productForm, reorder_level: value })
                                }
                                placeholder="10"
                            />
                        </div>

                        <FormSelect
                            label="Status"
                            value={productForm.status}
                            onChange={(value) =>
                                setProductForm({ ...productForm, status: value })
                            }
                            options={[
                                { value: "ACTIVE", label: "Active" },
                                { value: "INACTIVE", label: "Inactive" },
                            ]}
                        />

                        <SupplierAssignmentSection
                            suppliers={suppliers.filter((supplier) => supplier.status === "ACTIVE")}
                            assignments={productForm.suppliers}
                            onChange={updateProductSupplier}
                        />

                        <FileInput
                            label="Product Image"
                            selectedImageName={selectedImageName}
                            onChange={(file) => {
                                setProductForm({ ...productForm, product_image: file });
                                setSelectedImageName(file ? file.name : "");
                            }}
                        />

                        {editProduct && (
                            <div className="rounded-2xl bg-[#f8fcff] p-4">
                                <p className="mb-3 text-sm font-bold text-[#17325c]">
                                    Current Image
                                </p>

                                <ProductImage
                                    productId={editProduct.product_id}
                                    productName={editProduct.product_name}
                                    className="h-36 w-full rounded-2xl object-cover"
                                />

                                <p className="mt-2 text-xs font-semibold text-[#6f85a3]">
                                    Upload a new image only if you want to replace the current image.
                                </p>
                            </div>
                        )}

                        <FormTextarea
                            label="Description"
                            value={productForm.description}
                            onChange={(value) =>
                                setProductForm({ ...productForm, description: value })
                            }
                            placeholder="Short product description..."
                        />

                        <FormActions
                            saving={saving}
                            saveText={editProduct ? "Update Product" : "Add Product"}
                            onCancel={() => {
                                setShowProductForm(false);
                                setSelectedImageName("");
                            }}
                        />
                    </form>
                </Modal>
            )}

            {showPreview && (
                <Modal
                    title="POS Catalog Preview"
                    subtitle="Only active products are shown here."
                    onClose={() => setShowPreview(false)}
                    wide
                >
                    <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                        {products
                            .filter((item) => item.status === "ACTIVE" && item.category_status === "ACTIVE")
                            .map((item) => (
                                <div
                                    key={item.product_id}
                                    className="rounded-2xl border border-blue-50 bg-[#f8fcff] p-4"
                                >
                                    <ProductImage
                                        productId={item.product_id}
                                        productName={item.product_name}
                                        className="mb-3 h-28 w-full rounded-2xl object-cover"
                                    />

                                    <p className="text-sm font-extrabold text-[#07102f]">
                                        {item.product_name}
                                    </p>

                                    <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                        {item.category_name}
                                    </p>

                                    <div className="mt-3 flex items-center justify-between">
                                        <span className="text-lg font-extrabold text-[#0c2f73]">
                                            {formatCurrency(item.selling_price)}
                                        </span>

                                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-extrabold text-green-600">
                                            POS Active
                                        </span>
                                    </div>
                                </div>
                            ))}

                        {products.filter((item) => item.status === "ACTIVE" && item.category_status === "ACTIVE").length === 0 && (
                            <p className="col-span-full py-10 text-center font-semibold text-[#6f85a3]">
                                No active products available for POS preview.
                            </p>
                        )}
                    </div>
                </Modal>
            )}

            {showSettings && (
                <Modal
                    title="Admin Settings"
                    subtitle="Configure admin catalog view options."
                    onClose={() => setShowSettings(false)}
                >
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
                                title="Inactive Products"
                                desc={`${inactiveProducts} inactive product(s) hidden from POS.`}
                                color="orange"
                            />

                            <NotificationCard
                                title="Product Catalog"
                                desc={`${products.length} product(s) registered.`}
                                color="blue"
                            />

                            <NotificationCard
                                title="Categories"
                                desc={`${categories.length} category record(s) available.`}
                                color="green"
                            />
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 z-[60]">
                    <div
                        className={`rounded-2xl px-5 py-4 text-sm font-extrabold shadow-xl ${toast.type === "error"
                                ? "bg-red-500 text-white"
                                : "bg-green-600 text-white"
                            }`}
                    >
                        {toast.message}
                    </div>
                </div>
            )}
        </>
    );
}

function ProductTable({ products, onEdit, onDelete }) {
    return (
        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Image</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Reorder</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                </thead>

                <tbody>
                    {products.map((item) => (
                        <tr key={item.product_id} className="border-t bg-white">
                            <td className="px-4 py-4">
                                <p className="font-extrabold text-[#17325c]">
                                    {item.product_name}
                                </p>
                                <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                    {item.product_code || `PID-${item.product_id}`}
                                </p>
                            </td>

                            <td className="px-4 py-4">
                                <ProductImage
                                    productId={item.product_id}
                                    productName={item.product_name}
                                    className="h-14 w-16 rounded-xl object-cover"
                                />
                            </td>

                            <td className="px-4 py-4 font-semibold text-[#17325c]">
                                <div className="flex flex-col gap-2">
                                    <span>{item.category_name}</span>
                                    {item.status === "ACTIVE" && item.category_status === "INACTIVE" && (
                                        <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-xs font-extrabold text-orange-600">
                                            Category Inactive
                                        </span>
                                    )}
                                </div>
                            </td>

                            <td className="px-4 py-4 font-extrabold text-[#0c2f73]">
                                {formatCurrency(item.selling_price)}
                            </td>

                            <td className="px-4 py-4 font-semibold text-[#17325c]">
                                {item.reorder_level}
                            </td>

                            <td className="px-4 py-4">
                                <StatusBadge status={item.status} />
                            </td>

                            <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                    <ActionButton icon={Pencil} onClick={() => onEdit(item)} />
                                    <ActionButton icon={Trash2} danger onClick={() => onDelete(item)} />
                                </div>
                            </td>
                        </tr>
                    ))}

                    {products.length === 0 && (
                        <tr>
                            <td colSpan="7" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                No product records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function CategoryTable({ categories, onEdit, onDelete }) {
    return (
        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-50">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#eef6fb] text-xs uppercase text-[#6f85a3]">
                    <tr>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                </thead>

                <tbody>
                    {categories.map((item) => (
                        <tr key={item.category_id} className="border-t bg-white">
                            <td className="px-4 py-4">
                                <p className="font-extrabold text-[#17325c]">
                                    {item.category_name}
                                </p>
                                <p className="mt-1 text-xs font-bold text-[#6f85a3]">
                                    {item.category_code || `CID-${item.category_id}`}
                                </p>
                            </td>

                            <td className="px-4 py-4">
                                <StatusBadge status={item.status} />
                            </td>

                            <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                    <ActionButton icon={Pencil} onClick={() => onEdit(item)} />
                                    <ActionButton icon={Trash2} danger onClick={() => onDelete(item)} />
                                </div>
                            </td>
                        </tr>
                    ))}

                    {categories.length === 0 && (
                        <tr>
                            <td colSpan="3" className="px-4 py-10 text-center font-semibold text-[#6f85a3]">
                                No category records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function ProductImage({ productId, productName, className }) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        return (
            <div className={`grid place-items-center bg-white text-[#6f85a3] ${className}`}>
                <Package size={28} />
            </div>
        );
    }

    return (
        <img
            src={getProductImageUrl(productId)}
            alt={productName}
            className={className}
            onError={() => setHasError(true)}
        />
    );
}

function SupplierAssignmentSection({ suppliers, assignments, onChange }) {
    const getAssignment = (supplierId) => assignments.find(
        (item) => Number(item.supplier_id) === Number(supplierId)
    );

    return (
        <div className="rounded-2xl border border-blue-50 bg-white p-4">
            <div className="mb-4 flex flex-col gap-1">
                <h3 className="text-base font-extrabold text-[#07102f]">
                    Supplier Assignment
                </h3>
                <p className="text-sm font-semibold text-[#6f85a3]">
                    Select supplier(s) for this product and set purchase details.
                </p>
            </div>

            <div className="space-y-3">
                {suppliers.map((supplier) => {
                    const assignment = getAssignment(supplier.supplier_id);
                    const selected = Boolean(assignment);

                    return (
                        <div
                            key={supplier.supplier_id}
                            className={`rounded-2xl border p-4 transition ${
                                selected
                                    ? "border-[#1e4db7] bg-[#f8fcff]"
                                    : "border-blue-50 bg-white"
                            }`}
                        >
                            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:items-center">
                                <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={(event) =>
                                            onChange(supplier.supplier_id, "selected", event.target.checked)
                                        }
                                        className="mt-1 h-4 w-4 accent-[#0c2f73]"
                                    />
                                    <span className="min-w-0">
                                        <span className="block font-extrabold text-[#07102f]">
                                            {supplier.supplier_name}
                                        </span>
                                        <span className="mt-1 block text-xs font-semibold text-[#6f85a3]">
                                            {supplier.supplier_code || `SID-${supplier.supplier_id}`}
                                            {supplier.contact_person ? ` | ${supplier.contact_person}` : ""}
                                        </span>
                                    </span>
                                </label>

                                <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                                        Purchase Price
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={assignment?.purchase_price ?? ""}
                                        disabled={!selected}
                                        onChange={(event) =>
                                            onChange(supplier.supplier_id, "purchase_price", event.target.value)
                                        }
                                        placeholder="0.00"
                                        className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb] disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                                        Lead Time Days
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={assignment?.lead_time_days ?? ""}
                                        disabled={!selected}
                                        onChange={(event) =>
                                            onChange(supplier.supplier_id, "lead_time_days", event.target.value)
                                        }
                                        placeholder="0"
                                        className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb] disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </label>
                            </div>
                        </div>
                    );
                })}

                {suppliers.length === 0 && (
                    <div className="rounded-2xl bg-[#f8fcff] p-4 text-center text-sm font-semibold text-[#6f85a3]">
                        No active suppliers available.
                    </div>
                )}
            </div>
        </div>
    );
}

function FileInput({ label, selectedImageName, onChange }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-4 font-semibold text-[#17325c] hover:bg-blue-100">
                <ImagePlus size={18} className="text-[#1e4db7]" />

                <span className="text-sm">
                    {selectedImageName || "Choose image from computer"}
                </span>

                <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(e) => onChange(e.target.files[0] || null)}
                    className="hidden"
                />
            </label>

            <p className="mt-2 text-xs font-semibold text-[#6f85a3]">
                Supported format: PNG, JPG, JPEG, WEBP.
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
            <h2 className={`mt-4 text-2xl font-extrabold ${color}`}>{value}</h2>
        </div>
    );
}

function StatusBadge({ status }) {
    return (
        <span
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${status === "ACTIVE"
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-500"
                }`}
        >
            {status}
        </span>
    );
}

function ActionButton({ icon: Icon, onClick, danger = false }) {
    return (
        <button
            onClick={onClick}
            className={`grid h-9 w-9 place-items-center rounded-xl ${danger
                    ? "bg-red-50 text-red-500 hover:bg-red-100"
                    : "bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100"
                }`}
        >
            <Icon size={16} />
        </button>
    );
}

function FormInput({ label, value, onChange, placeholder, type = "text" }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>
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

function FormSelect({ label, value, onChange, options }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none"
            >
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
            <label className="mb-2 block text-sm font-bold text-[#17325c]">
                {label}
            </label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows="4"
                className="w-full resize-none rounded-2xl bg-[#eef6fb] px-4 py-3 font-semibold text-[#17325c] outline-none placeholder:text-[#8aa0bb]"
            />
        </div>
    );
}

function FormActions({ saving, saveText, onCancel }) {
    return (
        <div className="flex gap-3 pt-2">
            <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#254e7a] hover:bg-blue-100"
            >
                Cancel
            </button>

            <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986] disabled:cursor-not-allowed disabled:opacity-60"
            >
                {saving ? "Saving..." : saveText}
            </button>
        </div>
    );
}

function Modal({ title, subtitle, children, onClose, wide = false }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div
                className={`max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl ${wide ? "w-[900px]" : "w-[520px]"
                    }`}
            >
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#07102f]">
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="mt-1 text-sm text-[#6f85a3]">
                                {subtitle}
                            </p>
                        )}
                    </div>

                    <button
                        onClick={onClose}
                        className="grid h-9 w-9 place-items-center rounded-full bg-[#eef6fb] text-[#254e7a]"
                    >
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
            <button
                onClick={onChange}
                className={`relative h-7 w-14 rounded-full transition ${value ? "bg-[#1e4db7]" : "bg-gray-300"
                    }`}
            >
                <div
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${value ? "left-8" : "left-1"
                        }`}
                />
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

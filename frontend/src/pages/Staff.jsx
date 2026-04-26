import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Settings,
  ShoppingCart,
  BarChart3,
  User,
  LogOut,
  HelpCircle,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  ReceiptText,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";//for page transition animations

const API_BASE = "http://localhost:5000";

export default function Staff() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [showHelp, setShowHelp] = useState(false);//Help Button
  const [showDiscountPad, setShowDiscountPad] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [showHoldList, setShowHoldList] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const savedUser =
      JSON.parse(localStorage.getItem("user")) ||
      JSON.parse(sessionStorage.getItem("user"));

    if (!savedUser) {
      navigate("/");
      return;
    }

    setUser(savedUser);
    fetchPOSData(savedUser);
  }, [navigate]);

  const fetchPOSData = async (savedUser) => {
    try {
      setLoading(true);

      const [categoryRes, productRes, inventoryRes] = await Promise.all([
        fetch(`${API_BASE}/admin/categories`),
        fetch(`${API_BASE}/admin/products`),
        fetch(`${API_BASE}/admin/inventory`),
      ]);

      const categoryData = await categoryRes.json();
      const productData = await productRes.json();
      const inventoryData = await inventoryRes.json();

      setCategories(categoryData.filter((cat) => cat.status === "ACTIVE"));
      setProducts(productData.filter((product) => product.status === "ACTIVE"));

      setInventory(
        inventoryData.filter(
          (item) => Number(item.branch_id) === Number(savedUser.branch_id)
        )
      );
    } catch (error) {
      console.error(error);
      alert("Failed to load POS data. Check backend server.");
    } finally {
      setLoading(false);
    }
  };

  const productsWithStock = useMemo(() => {
    return products.map((product) => {
      const stock = inventory.find(
        (item) => Number(item.product_id) === Number(product.product_id)
      );

      return {
        ...product,
        quantity_in_stock: stock ? Number(stock.quantity_in_stock) : 0,
      };
    });
  }, [products, inventory]);

  const filteredProducts = useMemo(() => {
    return productsWithStock.filter((product) => {
      const matchCategory =
        activeCategory === "ALL" ||
        Number(product.category_id) === Number(activeCategory);

      const keyword = searchTerm.toLowerCase();

      const matchSearch =
        product.product_name?.toLowerCase().includes(keyword) ||
        product.product_code?.toLowerCase().includes(keyword) ||
        product.category_name?.toLowerCase().includes(keyword);

      return matchCategory && matchSearch;
    });
  }, [productsWithStock, activeCategory, searchTerm]);

  const getImageUrl = (imagePath) => {
    if (!imagePath) return "https://placehold.co/600x400?text=No+Image";
    if (imagePath.startsWith("http")) return imagePath;
    return `${API_BASE}${imagePath}`;
  };

  const addToCart = (product) => {
    if (product.quantity_in_stock <= 0) {
      setToast({
        show: true,
        message: "This product is out of stock."
        });

        setTimeout(() => {
        setToast({ show: false, message: "" });
     }, 2500);
      return;
    }

    setCart((prevCart) => {
      const existing = prevCart.find(
        (item) => item.product_id === product.product_id
      );

      if (existing) {
        if (existing.quantity >= product.quantity_in_stock) {
          alert("Cannot add more than available stock.");
          return prevCart;
        }

        return prevCart.map((item) =>
          item.product_id === product.product_id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * Number(item.selling_price),
              }
            : item
        );
      }

      return [
        ...prevCart,
        {
          ...product,
          quantity: 1,
          subtotal: Number(product.selling_price),
        },
      ];
    });
  };

  const increaseQty = (productId) => {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product_id !== productId) return item;

        if (item.quantity >= item.quantity_in_stock) {
          alert("Cannot add more than available stock.");
          return item;
        }

        return {
          ...item,
          quantity: item.quantity + 1,
          subtotal: (item.quantity + 1) * Number(item.selling_price),
        };
      })
    );
  };

  const decreaseQty = (productId) => {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.product_id === productId
            ? {
                ...item,
                quantity: item.quantity - 1,
                subtotal: (item.quantity - 1) * Number(item.selling_price),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setCart((prevCart) =>
      prevCart.filter((item) => item.product_id !== productId)
    );
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const discountPercent = Number(discountInput || 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const discountedSubtotal = subtotal - discountAmount;
  const tax = discountedSubtotal * 0.08;
  const total = discountedSubtotal + tax;

  const logout = () => {
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    navigate("/");
  };

  const handlePrintHold = () => {
  if (cart.length === 0) {
    alert("Cart is empty.");
    return;
  }

  const holdOrders = JSON.parse(localStorage.getItem("holdOrders")) || [];

  const newOrder = {
    id: Date.now(),
    items: cart,
    subtotal,
    discountPercent,
    discountAmount,
    tax,
    total,
    created_at: new Date().toLocaleString(),
  };

  holdOrders.push(newOrder);
  localStorage.setItem("holdOrders", JSON.stringify(holdOrders));

  setCart([]);
  setDiscountInput("");

  alert("Order saved to hold.");
};

    const resumeHoldOrder = (orderId) => {
    const holdOrders = JSON.parse(localStorage.getItem("holdOrders")) || [];

    const selectedOrder = holdOrders.find((order) => order.id === orderId);

    if (!selectedOrder) {
        alert("Hold order not found.");
        return;
    }

    setCart(selectedOrder.items);
    setDiscountInput(String(selectedOrder.discountPercent || ""));

    const updatedOrders = holdOrders.filter((order) => order.id !== orderId);
    localStorage.setItem("holdOrders", JSON.stringify(updatedOrders));

    setShowHoldList(false);
    };

    const deleteHoldOrder = (orderId) => {
    const holdOrders = JSON.parse(localStorage.getItem("holdOrders")) || [];
    const updatedOrders = holdOrders.filter((order) => order.id !== orderId);

    localStorage.setItem("holdOrders", JSON.stringify(updatedOrders));
    setShowHoldList(false);
    setTimeout(() => setShowHoldList(true), 0);
    };

  const completeTransaction = () => {
    if (cart.length === 0) {
      alert("Cart is empty.");
      return;
    }

    alert("Next step: connect sale API and auto deduct inventory.");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#eef6fb] text-[#6f85a3]">
        <div className="text-center">
          <Package size={42} className="mx-auto mb-3" />
          <p className="font-semibold">Loading POS Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="h-screen w-full overflow-hidden bg-[#eef6fb] text-[#17325c]"
    >
      <div className="grid h-full grid-cols-[230px_minmax(0,1fr)_330px]">

        {/* SIDEBAR */}
        <aside className="flex flex-col bg-[#d9edf8] px-5 py-6 border-r border-blue-100">
          <div className="mb-8 text-2xl font-extrabold text-[#1e4db7]">
            RetailPulse
          </div>

          <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
            <h4 className="font-extrabold text-[#16325b]">
              {user?.branch_name || "Main Branch"}
            </h4>
            <p className="mt-1 text-xs text-[#6f85a3]">
              Staff ID: {user?.user_id}
            </p>
          </div>

          <nav className="space-y-3">
            <button className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 font-bold text-[#1e4db7] shadow">
              <ShoppingCart size={18} />
              <span>POS Terminal</span>
            </button>

            <button
              onClick={() => navigate("/staff-analytics")}
              className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 font-semibold text-[#254e7a] hover:bg-white/70"
            >
              <BarChart3 size={18} />
              <span>Analytics</span>
            </button>

            </nav>

          <div className="mt-auto space-y-3">
            <button
                onClick={() => setShowHelp(!showHelp)}
                className="flex w-full items-center gap-4 rounded-2xl bg-white/30 px-4 py-4 text-sm font-semibold text-[#254e7a]"
                >
                <HelpCircle size={17} />
                <span>Help Support</span>
                </button>

          </div>
        </aside>

        {/* MAIN CONTENT */}
        <motion.main
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
        className="min-w-0 overflow-y-auto px-6 py-6"
        >
          <header className="mb-6 flex items-center gap-5">
            <div className="flex gap-4">
              <button className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#4e6e8c] shadow">
                Dashboard
              </button>
              <button className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#1e4db7] shadow border-b-2 border-[#1e4db7]">
                Inventory
              </button>
            </div>

            <div className="ml-auto flex h-[52px] max-w-[520px] flex-1 items-center gap-3 rounded-full bg-[#e8f4fb] px-5 shadow">
              <Search size={17} className="text-[#0d2d6c]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search SKU or Product..."
                className="h-full w-full bg-transparent text-sm font-medium outline-none placeholder:text-[#86a2bc]"
              />
            </div>

            {/* Bell */}
            <div className="relative flex items-center gap-3">
            <button
                onClick={() => setShowNotifications(true)}
                className="grid h-11 w-11 place-items-center rounded-full bg-white shadow"
            >
                <Bell size={18} />
            </button>

            <button className="grid h-11 w-11 place-items-center rounded-full bg-white shadow">
                <Settings size={18} />
            </button>

            <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="grid h-11 w-11 place-items-center rounded-full bg-[#0d2d6c] font-bold text-white shadow"
            >
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
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
                    className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-red-500 hover:bg-red-50"
                >
                    Logout
                </button>
                </div>
            )}
            </div>

          </header>

          {/* CATEGORIES */}
          <section className="mb-5 flex gap-3 overflow-x-auto pb-3">
            <button
              onClick={() => setActiveCategory("ALL")}
              className={`whitespace-nowrap rounded-full px-7 py-3 text-sm font-bold ${
                activeCategory === "ALL"
                  ? "bg-[#0c2f73] text-white shadow"
                  : "bg-[#dcf0f9] text-[#1f4e77]"
              }`}
            >
              All Products
            </button>

            {categories.map((category) => (
              <button
                key={category.category_id}
                onClick={() => setActiveCategory(category.category_id)}
                className={`whitespace-nowrap rounded-full px-7 py-3 text-sm font-bold ${
                  Number(activeCategory) === Number(category.category_id)
                    ? "bg-[#0c2f73] text-white shadow"
                    : "bg-[#dcf0f9] text-[#1f4e77]"
                }`}
              >
                {category.category_name}
              </button>
            ))}
          </section>

          {/* PRODUCTS */}
          <section className="grid grid-cols-[repeat(auto-fill,minmax(235px,1fr))] gap-5 pb-6">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full grid min-h-[280px] place-items-center text-[#8ba3bc]">
                <div className="text-center">
                  <Package size={40} className="mx-auto mb-3" />
                  <p>No products found.</p>
                </div>
              </div>
            ) : (
              filteredProducts.map((product) => (
                <article
                  key={product.product_id}
                  onClick={() => addToCart(product)}
                  className="cursor-pointer overflow-hidden rounded-[20px] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative h-[180px] overflow-hidden bg-slate-100">
                    <img
                      src={getImageUrl(product.product_image)}
                      alt={product.product_name}
                      className="h-full w-full object-cover transition hover:scale-105"
                    />

                    <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[10px] font-extrabold uppercase text-[#23557e]">
                      {product.category_name}
                    </span>
                  </div>

                  <div className="px-4 py-4">
                    <h3 className="min-h-[42px] text-base font-extrabold leading-snug text-[#132c51]">
                      {product.product_name}
                    </h3>

                    <p className="mt-1 text-xs text-[#6f8aaa]">
                      SKU: {product.product_code}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <strong className="text-lg font-extrabold text-[#103a72]">
                        RM {Number(product.selling_price).toFixed(2)}
                      </strong>

                      <span
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${
                          product.quantity_in_stock <= product.reorder_level
                            ? "bg-red-100 text-red-600"
                            : "bg-[#e2f0f5] text-[#4c7891]"
                        }`}
                      >
                        {product.quantity_in_stock} in stock
                      </span>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        </motion.main>

        {/* CART */}
        <aside className="flex min-w-0 flex-col bg-white px-5 py-6 border-l border-blue-100">
          <div className="mb-6 flex items-center justify-between border-b-2 border-[#ecf3f9] pb-4">
            <h2 className="text-2xl font-extrabold text-[#17325c]">
              Current Cart
            </h2>

            <button
              onClick={clearCart}
              className="flex items-center gap-2 rounded-full bg-[#eef6fb] px-3 py-2 text-xs font-bold uppercase text-[#5f7f99]"
            >
              <Trash2 size={14} />
              Clear All
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="grid min-h-[240px] place-items-center text-center text-[#8ba3bc]">
                <div>
                  <ShoppingCart size={38} className="mx-auto mb-3" />
                  <p>No items added yet.</p>
                </div>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product_id}
                  className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-[18px] bg-[#f8fbfe] p-3 border border-[#edf3f8]"
                >
                  <img
                    src={getImageUrl(item.product_image)}
                    alt={item.product_name}
                    className="h-14 w-14 rounded-2xl object-cover"
                  />

                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-extrabold text-[#17325c]">
                      {item.product_name}
                    </h4>

                    <p className="mt-1 text-[11px] text-[#8093aa]">
                      {item.product_code}
                    </p>

                    <div className="mt-2 inline-flex overflow-hidden rounded-full border border-[#e2ecf3] bg-white">
                      <button
                        onClick={() => decreaseQty(item.product_id)}
                        className="grid h-7 w-7 place-items-center hover:bg-[#eef3fc]"
                      >
                        <Minus size={13} />
                      </button>

                      <span className="grid h-7 min-w-8 place-items-center text-xs font-extrabold">
                        {item.quantity}
                      </span>

                      <button
                        onClick={() => increaseQty(item.product_id)}
                        className="grid h-7 w-7 place-items-center hover:bg-[#eef3fc]"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <strong className="whitespace-nowrap text-sm text-[#17325c]">
                      RM {item.subtotal.toFixed(2)}
                    </strong>

                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 border-t border-[#e2eef8] pt-5">
            <div className="mb-3 flex justify-between text-sm text-[#6f84a1]">
              <span>Subtotal ({cart.length} items)</span>
              <strong className="text-[#17325c]">
                RM {subtotal.toFixed(2)}
              </strong>
            </div>

            <div className="mb-3 flex justify-between text-sm text-[#6f84a1]">
            <span>Discount ({discountPercent}%)</span>
            <strong className="text-red-500">
                - RM {discountAmount.toFixed(2)}
            </strong>
            </div>

            <div className="mb-4 flex justify-between text-sm text-[#6f84a1]">
              <span>Tax (8%)</span>
              <strong className="text-[#17325c]">RM {tax.toFixed(2)}</strong>
            </div>

            <div className="mb-5 flex justify-between border-t border-dashed border-[#cde0ec] pt-4 text-lg font-extrabold">
              <span>Total Amount</span>
              <strong className="text-xl text-orange-600">
                RM {total.toFixed(2)}
              </strong>
            </div>

            <button
              onClick={completeTransaction}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#0c2f73] px-4 py-4 font-extrabold text-white shadow-lg hover:bg-[#103986]"
            >
              <CreditCard size={17} />
              Complete Transaction
            </button>

            <div className="grid grid-cols-2 gap-3">
                <button
                onClick={() => setShowHoldList(true)}
                className="flex items-center justify-center gap-2 rounded-full bg-[#ecf5fa] px-3 py-3 text-xs font-extrabold text-[#2a577b]"
                >
                <ReceiptText size={15} />
                Print Hold
                </button>

              <button
              onClick={() => setShowDiscountPad(true)}
              className="flex items-center justify-center gap-2 rounded-full bg-[#ecf5fa] px-3 py-3 text-xs font-extrabold text-[#2a577b]"
              >
              <Plus size={15} />
              Add Discount
              </button>

            </div>
          </div>
        </aside>
      </div>

      {toast.show && (
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-red-500 text-white px-6 py-4 rounded-xl shadow-xl animate-slideUp">
            {toast.message}
            </div>
        </div>
    )}

    {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[420px] rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-extrabold text-[#07102f]">
                Help Support
                </h2>

                <button
                onClick={() => setShowHelp(false)}
                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                >
                ✕
                </button>
            </div>

            <div className="space-y-5 text-sm text-[#17325c]">
                <div>
                <h3 className="mb-2 font-extrabold">Quick Help</h3>
                <p>• Create a sale</p>
                <p>• Handle out-of-stock items</p>
                <p>• View analytics report</p>
                </div>

                <div className="border-t pt-4">
                <h3 className="mb-2 font-extrabold">Contact Support</h3>
                <p>WhatsApp:017-7032568</p>
                <p>Email: support@retailpulse.com</p>
                </div>

                <div className="rounded-2xl bg-[#eef6fb] p-4">
                <h3 className="mb-1 font-extrabold">System Status</h3>
                <p className="text-green-600 font-bold">● Active</p>
                </div>
            </div>
            </div>
        </div>
        )}

        {showDiscountPad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-[360px] rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-[#07102f]">
                Add Discount
                </h2>

                <button
                onClick={() => setShowDiscountPad(false)}
                className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold"
                >
                ✕
                </button>
            </div>

            <div className="mb-5 rounded-2xl bg-[#d8eef9] px-5 py-4 text-right text-3xl font-extrabold text-[#0c2f73]">
                {discountInput || "0"}%
            </div>

            <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                    key={num}
                    onClick={() => {
                    const nextValue = discountInput + num;
                    if (Number(nextValue) <= 100) {
                        setDiscountInput(nextValue);
                    }
                    }}
                    className="rounded-2xl bg-[#eef6fb] py-4 text-xl font-extrabold text-[#0c2f73]"
                >
                    {num}
                </button>
                ))}

                <button
                onClick={() => setDiscountInput("")}
                className="rounded-2xl bg-red-100 py-4 text-sm font-extrabold text-red-600"
                >
                Clear
                </button>

                <button
                onClick={() => {
                    const nextValue = discountInput + "0";
                    if (Number(nextValue) <= 100) {
                    setDiscountInput(nextValue);
                    }
                }}
                className="rounded-2xl bg-[#eef6fb] py-4 text-xl font-extrabold text-[#0c2f73]"
                >
                0
                </button>

                <button
                onClick={() => setDiscountInput(discountInput.slice(0, -1))}
                className="rounded-2xl bg-[#eef6fb] py-4 text-sm font-extrabold text-[#0c2f73]"
                >
                Del
                </button>
            </div>

            <button
                onClick={() => setShowDiscountPad(false)}
                className="mt-5 w-full rounded-full bg-[#0c2f73] py-4 font-extrabold text-white"
            >
                Apply Discount
            </button>
            </div>
        </div>
        )}

        {showHoldList && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                <div className="w-[460px] rounded-3xl bg-white p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-xl font-extrabold text-[#07102f]">
                    Hold Orders
                    </h2>

                    <button
                    onClick={() => setShowHoldList(false)}
                    className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
                    >
                    ✕
                    </button>
                </div>

                <button
                onClick={handlePrintHold}
                className="mb-4 w-full rounded-full bg-[#0c2f73] py-3 text-sm font-extrabold text-white"
                >
                Hold Current Cart
                </button>

                {JSON.parse(localStorage.getItem("holdOrders") || "[]").length === 0 ? (
                    <div className="rounded-2xl bg-[#eef6fb] p-5 text-center text-sm font-semibold text-[#6f84a1]">
                    No hold orders found.
                    </div>
                ) : (
                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {JSON.parse(localStorage.getItem("holdOrders") || "[]").map(
                        (order) => (
                        <div
                            key={order.id}
                            className="rounded-2xl border border-[#e2eef8] bg-[#f8fbfe] p-4"
                        >
                            <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="font-extrabold text-[#17325c]">
                                Hold #{order.id}
                                </p>
                                <p className="text-xs text-[#6f84a1]">
                                {order.created_at}
                                </p>
                            </div>

                            <p className="font-extrabold text-orange-600">
                                RM {Number(order.total || 0).toFixed(2)}
                            </p>
                            </div>

                            <p className="mb-3 text-sm text-[#6f84a1]">
                            Items: {order.items.length} | Discount:{" "}
                            {order.discountPercent || 0}%
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => resumeHoldOrder(order.id)}
                                className="rounded-full bg-[#0c2f73] py-3 text-sm font-extrabold text-white"
                            >
                                Resume
                            </button>

                            <button
                                onClick={() => deleteHoldOrder(order.id)}
                                className="rounded-full bg-red-100 py-3 text-sm font-extrabold text-red-600"
                            >
                                Delete
                            </button>
                            </div>
                        </div>
                        )
                    )}
                    </div>
                )}
                </div>
            </div>
            )}

        {showNotifications && (
            <div className="fixed inset-0 z-50">
                <div
                onClick={() => setShowNotifications(false)}
                className="absolute inset-0 bg-black/20"
                />

                <div className="absolute right-0 top-0 h-full w-[360px] bg-white p-6 shadow-2xl">
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
                    <div className="rounded-2xl bg-red-50 p-4">
                    <p className="font-extrabold text-red-600">Low Stock Alert</p>
                    <p className="mt-1 text-sm text-[#6f84a1]">
                        Some products are below reorder level.
                    </p>
                    </div>

                    <div className="rounded-2xl bg-[#eef6fb] p-4">
                    <p className="font-extrabold text-[#17325c]">System Active</p>
                    <p className="mt-1 text-sm text-[#6f84a1]">
                        RetailPulse POS is running normally.
                    </p>
                    </div>

                    <div className="rounded-2xl bg-[#eef6fb] p-4">
                    <p className="font-extrabold text-[#17325c]">Reminder</p>
                    <p className="mt-1 text-sm text-[#6f84a1]">
                        Complete all held orders before closing shift.
                    </p>
                    </div>
                </div>
                </div>
            </div>
            )}

    </motion.div>
  );
}
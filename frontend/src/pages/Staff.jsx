import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Settings,
  ShoppingCart,
  BarChart3,
  History,
  User,
  LogOut,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  ReceiptText,
  Package,
  X,
  Banknote,
  Wallet,
  ShieldCheck,
  CheckCircle,
  Printer,
  Download,
  Mail,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";//for page transition animations
import { downloadPDF } from "../utils/downloadPDF";
import { formatCurrency } from "../utils/formatCurrency";
import api from "../api/axios";

const API_BASE = "http://localhost:5000";
const DEFAULT_PRODUCT_IMAGE_URL = `${API_BASE}/static/images/products/default.webp`;
const HOLD_ORDERS_STORAGE_KEY = "holdOrders";
const HOLD_ORDER_EXPIRY_MS = 3 * 60 * 60 * 1000;
const SHOW_LEGACY_SALES_HISTORY_MODAL = false;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getStoredHoldOrders = () => {
  try {
    const storedOrders = JSON.parse(
      localStorage.getItem(HOLD_ORDERS_STORAGE_KEY) || "[]"
    );

    return Array.isArray(storedOrders) ? storedOrders : [];
  } catch {
    localStorage.setItem(HOLD_ORDERS_STORAGE_KEY, JSON.stringify([]));
    return [];
  }
};

const getActiveHoldOrders = () => {
  const now = Date.now();
  const holdOrders = getStoredHoldOrders();
  const activeOrders = holdOrders.filter(
    (order) => Number(order.expiresAt || 0) > now
  );

  if (activeOrders.length !== holdOrders.length) {
    localStorage.setItem(HOLD_ORDERS_STORAGE_KEY, JSON.stringify(activeOrders));
  }

  return activeOrders;
};

const formatHoldExpiry = (expiresAt, currentTime = Date.now()) => {
  const remainingMs = Math.max(Number(expiresAt || 0) - currentTime, 0);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) {
    return `Expires in ${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `Expires in ${minutes}m ${seconds}s`;
  }

  return `Expires in ${seconds}s`;
};

export default function Staff() {
  const navigate = useNavigate();
  const location = useLocation();
  const handledSalesHistoryRouteState = useRef(false);

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
  const [heldOrders, setHeldOrders] = useState([]);
  const [holdCountdownNow, setHoldCountdownNow] = useState(Date.now());
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [salesHistory, setSalesHistory] = useState([]);
  const [salesHistorySearch, setSalesHistorySearch] = useState("");
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false); // hover-expand sidebar
  const sidebarOpen = sidebarPinned || sidebarHovered;
  //Settings section states
  const [showSettings, setShowSettings] = useState(false);
  const [taxRate, setTaxRate] = useState(
    Number(sessionStorage.getItem("taxRate") || 0)
  );

  const [terminalName, setTerminalName] = useState(
    sessionStorage.getItem("terminalName") || "POS-01"
  );

  const [receiptFooter, setReceiptFooter] = useState(
    sessionStorage.getItem("receiptFooter") || "Thank you for shopping with us!"
  );

  const [eyeCareMode, setEyeCareMode] = useState(
  sessionStorage.getItem("eyeCareMode") === "true"
  );

  //Store user information and fetch initial data on component mount
  useEffect(() => {
    const savedUser =
      JSON.parse(sessionStorage.getItem("user")) ||
      JSON.parse(sessionStorage.getItem("user"));

    if (!savedUser) {
      navigate("/");
      return;
    }

    setUser(savedUser);
    fetchPOSData(savedUser);
  }, [navigate]);

  useEffect(() => {
    if (!showHoldList) return;

    const updateHoldCountdown = () => {
      const activeOrders = getActiveHoldOrders();
      setHeldOrders(activeOrders);
      setHoldCountdownNow(Date.now());
    };

    updateHoldCountdown();
    const intervalId = setInterval(updateHoldCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [showHoldList]);

  const fetchPOSData = async (savedUser) => {
    try {
      setLoading(true);

      const [categoryRes, productRes, inventoryRes] = await Promise.all([
        fetch(`${API_BASE}/admin/categories`),
        fetch(`${API_BASE}/admin/products?available=1`),
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
    const value = String(imagePath || "").trim();

    if (!value || value.toLowerCase() === "null" || value.toLowerCase() === "undefined") {
      return DEFAULT_PRODUCT_IMAGE_URL;
    }

    if (value.startsWith("http")) return value;

    const normalized = value.replace(/\\/g, "/");

    if (normalized.startsWith("/")) {
      return `${API_BASE}${normalized}`;
    }

    const staticPath = normalized.includes("static/images/products/")
      ? normalized.slice(normalized.indexOf("static/images/products/"))
      : `static/images/products/${normalized.split("/").pop()}`;

    return `${API_BASE}/${staticPath}`;
  };

  const handleProductImageError = (event) => {
    if (event.currentTarget.src !== DEFAULT_PRODUCT_IMAGE_URL) {
      event.currentTarget.src = DEFAULT_PRODUCT_IMAGE_URL;
    }
  };

  const showToastMessage = (message) => {
    setToast({
      show: true,
      message,
    });

    setTimeout(() => {
      setToast({ show: false, message: "" });
    }, 2500);
  };

  const sendReceiptEmail = async () => {
    const email = customerEmail.trim();

    if (!email) {
      alert("Please enter email.");
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    if (!completedSale) {
      alert("Receipt details are not available.");
      return;
    }

    try {
      setEmailSending(true);

      const res = await fetch(`${API_BASE}/staff/email-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          receipt: {
            sale_code: completedSale.sale_code,
            branch_name: completedSale.branch_name || user?.branch_name || "Branch",
            cashier_name: completedSale.cashier_name || user?.name || "Staff",
            terminal_name: terminalName,
            payment_method: completedSale.payment_method,
            cart: completedSale.cart,
            subtotal: completedSale.subtotal,
            discount_amount: completedSale.discountAmount,
            tax: completedSale.tax,
            total: completedSale.total,
            receipt_footer: receiptFooter,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Unable to send receipt email.");
        return;
      }

      setShowEmailPopup(false);
      setCustomerEmail("");
      showToastMessage(data.message || `Receipt sent to ${email}`);
    } catch (error) {
      console.error(error);
      alert("Unable to send receipt email. Check backend connection.");
    } finally {
      setEmailSending(false);
    }
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

  const updateDiscountInput = (value) => {
    const cleanedValue = value
      .replace(/[^\d.]/g, "")
      .replace(/(\..*)\./g, "$1");

    if (cleanedValue === "") {
      setDiscountInput("");
      return;
    }

    if (!/^\d{0,3}(\.\d{0,2})?$/.test(cleanedValue)) return;
    if (Number(cleanedValue) <= 100) {
      setDiscountInput(cleanedValue);
    }
  };

  const discountPercent = Number(discountInput || 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const discountedSubtotal = subtotal - discountAmount;
  const tax = discountedSubtotal * (taxRate / 100);
  const total = discountedSubtotal + tax;

  const filteredSalesHistory = useMemo(() => {
    const keyword = salesHistorySearch.trim().toLowerCase();

    if (!keyword) return salesHistory;

    return salesHistory.filter((sale) => {
      return (
        sale.sale_code?.toLowerCase().includes(keyword) ||
        sale.user_name?.toLowerCase().includes(keyword) ||
        sale.payment_method?.toLowerCase().includes(keyword) ||
        String(sale.sale_id || "").includes(keyword)
      );
    });
  }, [salesHistory, salesHistorySearch]);

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

  const openHoldList = () => {
    setHeldOrders(getActiveHoldOrders());
    setHoldCountdownNow(Date.now());
    setShowHoldList(true);
  };

  const handlePrintHold = () => {
  if (cart.length === 0) {
    alert("Cart is empty.");
    return;
  }

  const holdOrders = getActiveHoldOrders();
  const holdDate = new Date();
  const now = holdDate.getTime();

  const newOrder = {
    id: now,
    items: cart,
    subtotal,
    discountPercent,
    discountAmount,
    tax,
    total,
    holdTime: now,
    expiresAt: now + HOLD_ORDER_EXPIRY_MS,
    created_at: holdDate.toLocaleString(),
  };

  holdOrders.push(newOrder);
  localStorage.setItem(HOLD_ORDERS_STORAGE_KEY, JSON.stringify(holdOrders));
  setHeldOrders(holdOrders);

  setCart([]);
  setDiscountInput("");

  alert("Order saved to hold.");
};

    const resumeHoldOrder = (orderId) => {
    const holdOrders = getActiveHoldOrders();

    const selectedOrder = holdOrders.find((order) => order.id === orderId);

    if (!selectedOrder) {
        setHeldOrders(holdOrders);
        alert("Hold order not found.");
        return;
    }

    setCart(selectedOrder.items);
    setDiscountInput(String(selectedOrder.discountPercent || ""));

    const updatedOrders = holdOrders.filter((order) => order.id !== orderId);
    localStorage.setItem(HOLD_ORDERS_STORAGE_KEY, JSON.stringify(updatedOrders));
    setHeldOrders(updatedOrders);

    setShowHoldList(false);
    };

    const deleteHoldOrder = (orderId) => {
    const holdOrders = getActiveHoldOrders();
    const updatedOrders = holdOrders.filter((order) => order.id !== orderId);

    localStorage.setItem(HOLD_ORDERS_STORAGE_KEY, JSON.stringify(updatedOrders));
    setHeldOrders(updatedOrders);
    };

  const fetchSalesHistory = async (savedUser = user) => {
    if (!savedUser?.branch_id) return;

    try {
      setLoadingSalesHistory(true);

      const res = await fetch(`${API_BASE}/admin/sales`);
      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Failed to load sales history.");
        return;
      }

      const branchSales = Array.isArray(data)
        ? data
            .filter((sale) => Number(sale.branch_id) === Number(savedUser.branch_id))
            .sort((a, b) => new Date(b.sale_date || 0) - new Date(a.sale_date || 0))
        : [];

      setSalesHistory(branchSales);
    } catch (error) {
      console.error(error);
      alert("Failed to load sales history. Check backend connection.");
    } finally {
      setLoadingSalesHistory(false);
    }
  };

  const openSalesHistory = () => {
    setShowSalesHistory(true);
    fetchSalesHistory();
  };

  useEffect(() => {
    if (
      !user ||
      !location.state?.openSalesHistory ||
      handledSalesHistoryRouteState.current
    ) {
      return;
    }

    handledSalesHistoryRouteState.current = true;
    setShowSalesHistory(true);

    const fetchRouteSalesHistory = async () => {
      if (!user?.branch_id) return;

      try {
        setLoadingSalesHistory(true);

        const res = await fetch(`${API_BASE}/admin/sales`);
        const data = await res.json();

        if (!res.ok) {
          alert(data.message || "Failed to load sales history.");
          return;
        }

        const branchSales = Array.isArray(data)
          ? data
              .filter((sale) => Number(sale.branch_id) === Number(user.branch_id))
              .sort((a, b) => new Date(b.sale_date || 0) - new Date(a.sale_date || 0))
          : [];

        setSalesHistory(branchSales);
      } catch (error) {
        console.error(error);
        alert("Failed to load sales history. Check backend connection.");
      } finally {
        setLoadingSalesHistory(false);
      }
    };

    fetchRouteSalesHistory();
    navigate(location.pathname, { replace: true, state: null });
  }, [user, location.pathname, location.state, navigate]);

  const reprintSaleReceipt = async (sale) => {
    try {
      const res = await fetch(`${API_BASE}/admin/sales/${sale.sale_id}/details`);
      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Failed to load sale details.");
        return;
      }

      const receiptItems = Array.isArray(data.details) ? data.details : [];
      const detailSubtotal = receiptItems.reduce(
        (sum, item) => sum + Number(item.subtotal || 0),
        0
      );
      const receiptSubtotal = detailSubtotal;
      const receiptTotal = Number(sale.total_amount || receiptSubtotal);
      const receiptDiscount = Number(
        sale.discount_amount ?? Math.max(receiptSubtotal - receiptTotal, 0)
      );
      const receiptDiscountPercent = Number(sale.discount_percent ?? 0);
      const receiptTax = Math.max(receiptTotal - receiptSubtotal + receiptDiscount, 0);

      setCompletedSale({
        sale_id: sale.sale_id,
        sale_code: sale.sale_code || `RP-${sale.sale_id}`,
        payment_method: sale.payment_method || "N/A",
        cashier_name: sale.user_name || user?.name || "Cashier",
        branch_name: sale.branch_name || user?.branch_name || "Branch",
        cart: receiptItems.map((item) => ({
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          quantity: Number(item.quantity || 0),
          selling_price: Number(item.unit_price || 0),
          subtotal: Number(item.subtotal || 0),
        })),
        subtotal: receiptSubtotal,
        discountPercent: receiptDiscountPercent,
        discountAmount: receiptDiscount,
        tax: receiptTax,
        taxRate: null,
        total: receiptTotal,
        date: sale.sale_date ? new Date(sale.sale_date) : new Date(),
        isReprint: true,
      });

      setShowSalesHistory(false);
      setPaymentSuccess(true);
    } catch (error) {
      console.error(error);
      alert("Failed to reprint receipt. Check backend connection.");
    }
  };

  const completeTransaction = () => {
  if (cart.length === 0) {
    alert("Cart is empty.");
    return;
  }

    setShowPaymentModal(true);
  };

  const confirmPayment = async () => {
    try {
      const saleRes = await fetch(`${API_BASE}/admin/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.user_id,
          branch_id: user.branch_id,
          total_amount: total,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          payment_method: paymentMethod,
        }),
      });

      const saleData = await saleRes.json();

      if (!saleRes.ok) {
        alert(saleData.message || "Failed to create sale.");
        return;
      }

      for (const item of cart) {
        const detailRes = await fetch(`${API_BASE}/admin/sale-details`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sale_id: saleData.sale_id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.selling_price,
          }),
        });

        const detailData = await detailRes.json();

        if (!detailRes.ok) {
          alert(detailData.message || "Failed to save sale detail.");
          return;
        }
      }

      const updateSaleRes = await fetch(`${API_BASE}/admin/sales/${saleData.sale_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.user_id,
          branch_id: user.branch_id,
          total_amount: total,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          payment_method: paymentMethod,
        }),
      });

      const updateSaleData = await updateSaleRes.json();

      if (!updateSaleRes.ok) {
        alert(updateSaleData.message || "Failed to update sale total.");
        return;
      }

      setCompletedSale({
        sale_id: saleData.sale_id,
        sale_code: saleData.sale_code || `RP-${saleData.sale_id}`,
        payment_method: paymentMethod,
        cashier_name: user?.name || "Cashier",
        branch_name: user?.branch_name || "Branch",
        cart,
        subtotal,
        discountPercent,
        discountAmount,
        tax,
        taxRate,
        total,
        date: new Date(),
        isReprint: false,
      });

      setShowPaymentModal(false);
      setPaymentSuccess(true);
      setCart([]);
      setDiscountInput("");
      fetchPOSData(user);
    } catch (error) {
      console.error(error);
      alert("Payment failed. Check backend connection.");
    }
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
        className={`h-screen w-full overflow-hidden ${
                    eyeCareMode
                      ? "bg-[#f4f1ea] text-[#3b3b3b]"
                      : "bg-[#eef6fb] text-[#17325c]"
                  }`}
    >
      <div
        className={`grid h-full transition-all duration-300 ${sidebarOpen
            ? showSalesHistory
              ? "grid-cols-[230px_minmax(0,1fr)]"
              : "grid-cols-[230px_minmax(0,1fr)_330px]"
            : showSalesHistory
              ? "grid-cols-[86px_minmax(0,1fr)]"
              : "grid-cols-[86px_minmax(0,1fr)_330px]"
          }`}
      >

        {/* SIDEBAR */}
        <aside
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`flex flex-col bg-[#d9edf8] py-6 border-r border-blue-100 transition-all duration-300 ${sidebarOpen ? "px-5" : "px-3"
            }`}
        >
          {/* Logo + Collapse Button */}
          <div
            className={`mb-8 flex items-center ${!sidebarOpen ? "justify-center" : "justify-between"
              }`}
          >
            {!!sidebarOpen && (
              <div className="text-2xl font-extrabold text-[#1e4db7]">
                RetailPulse
              </div>
            )}

            <button
              onClick={() => setSidebarPinned(!sidebarPinned)}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#1e4db7] shadow"
              title={sidebarPinned ? "Collapse sidebar" : "Pin sidebar"}
            >
              <ChevronRight
                size={18}
                className={`transition-transform duration-300 ${sidebarPinned ? "rotate-180" : ""
                  }`}
              />
            </button>
          </div>

          {/* Branch Info */}
          {!!sidebarOpen && (
            <div className="mb-7 rounded-2xl bg-white/50 px-4 py-3">
              <h4 className="font-extrabold text-[#16325b]">
                {user?.branch_name || "Main Branch"}
              </h4>
              <p className="mt-1 text-xs text-[#6f85a3]">
                Staff ID: {user?.user_id}
              </p>
            </div>
          )}

          {/* Navigation */}
          <nav className="space-y-3">
            {/* POS Terminal */}
            <button
              onClick={() => setShowSalesHistory(false)}
              className={`flex w-full items-center rounded-2xl py-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${showSalesHistory
                  ? "bg-white/30 font-semibold text-[#254e7a] hover:bg-white/70"
                  : "bg-white font-bold text-[#1e4db7] shadow"
                } ${!sidebarOpen ? "justify-center px-0" : "gap-4 px-4"
                }`}
            >
              <ShoppingCart size={18} />
              {!!sidebarOpen && <span>POS Terminal</span>}
            </button>

            {/* Analytics */}
            <button
              onClick={() => navigate("/staff-analytics")}
              className={`flex w-full items-center rounded-2xl bg-white/30 py-4 font-semibold text-[#254e7a] transition-all duration-300 hover:-translate-y-1 hover:bg-white/70 hover:shadow-lg ${!sidebarOpen ? "justify-center px-0" : "gap-4 px-4"
                }`}
            >
              <BarChart3 size={18} />
              {!!sidebarOpen && <span>Analytics</span>}
            </button>

            <button
              onClick={openSalesHistory}
              className={`flex w-full items-center rounded-2xl py-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${showSalesHistory
                  ? "bg-white font-bold text-[#1e4db7] shadow"
                  : "bg-white/30 font-semibold text-[#254e7a] hover:bg-white/70"
                } ${!sidebarOpen ? "justify-center px-0" : "gap-4 px-4"
                }`}
            >
              <History size={18} />
              {!!sidebarOpen && <span>Sales History</span>}
            </button>
          </nav>

        </aside>

        {/* MAIN CONTENT */}
        <motion.main
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
        className="min-w-0 overflow-y-auto px-6 py-6"
        >
          <header className="mb-6 flex items-center gap-5">
            <div className="ml-auto flex h-[60px] w-full max-w-[700px] flex-1 items-center gap-3 rounded-full bg-[#e8f4fb] px-6 shadow-md">
              <Search size={20} className="text-[#0d2d6c]" />
              <input
                value={showSalesHistory ? salesHistorySearch : searchTerm}
                onChange={(e) => {
                  if (showSalesHistory) {
                    setSalesHistorySearch(e.target.value);
                    return;
                  }

                  setSearchTerm(e.target.value);
                }}
                placeholder={
                  showSalesHistory
                    ? "Search receipt, cashier, or payment..."
                    : "Search SKU or Product..."
                }
                className="h-full w-full bg-transparent text-base font-medium outline-none placeholder:text-[#86a2bc]"
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

          {showSalesHistory ? (
            <section className="pb-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-extrabold text-[#07102f]">
                    Sales History
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                    {user?.branch_name || "Branch"}
                  </p>
                </div>

                <button
                  onClick={() => fetchSalesHistory()}
                  className="flex items-center gap-2 rounded-full bg-[#0c2f73] px-5 py-3 text-sm font-extrabold text-white shadow hover:bg-[#103986]"
                >
                  <History size={16} />
                  Refresh
                </button>
              </div>

              <div className="min-h-[520px] rounded-[20px] bg-white p-5 shadow-sm">
                {loadingSalesHistory ? (
                  <div className="grid min-h-[420px] place-items-center text-center text-[#8ba3bc]">
                    <div>
                      <ReceiptText size={42} className="mx-auto mb-3" />
                      <p>Loading sales history...</p>
                    </div>
                  </div>
                ) : filteredSalesHistory.length === 0 ? (
                  <div className="grid min-h-[420px] place-items-center text-center text-[#8ba3bc]">
                    <div>
                      <ReceiptText size={42} className="mx-auto mb-3" />
                      <p>No sales records found.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSalesHistory.map((sale) => {
                      const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;

                      return (
                        <div
                          key={sale.sale_id}
                          className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-[#e4eef7] bg-[#f8fbfe] p-4"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-extrabold text-[#07102f]">
                                #{sale.sale_code || `RP-${sale.sale_id}`}
                              </h3>
                              <span className="rounded-full bg-[#dff3fb] px-3 py-1 text-xs font-extrabold text-[#0c2f73]">
                                {sale.payment_method || "N/A"}
                              </span>
                            </div>

                            <p className="mt-2 text-sm font-semibold text-[#526b86]">
                              {sale.user_name || "Cashier"} |{" "}
                              {saleDate
                                ? `${saleDate.toLocaleDateString()} ${saleDate.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : "Date unavailable"}
                            </p>
                          </div>

                          <div className="flex flex-col items-end justify-between gap-3">
                            <strong className="text-lg text-orange-600">
                              {formatCurrency(sale.total_amount)}
                            </strong>
                            <button
                              onClick={() => reprintSaleReceipt(sale)}
                              className="flex items-center gap-2 rounded-full bg-[#0c2f73] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#103986]"
                            >
                              <Printer size={15} />
                              Reprint
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <>
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
                    filteredProducts.map((product) => {
                      const isOutOfStock = product.quantity_in_stock === 0;
                      const isLowStock =
                        product.quantity_in_stock > 0 &&
                        product.quantity_in_stock <= product.reorder_level;

                      return (
                        <article
                          key={product.product_id}
                          onClick={() => {
                            if (!isOutOfStock) {
                              addToCart(product);
                            }
                          }}
                          className={`overflow-hidden rounded-[20px] shadow-sm transition ${isOutOfStock
                              ? "cursor-not-allowed bg-gray-100 opacity-70"
                              : "cursor-pointer bg-white hover:-translate-y-1 hover:shadow-xl"
                            }`}
                        >
                          <div className="relative h-[180px] overflow-hidden bg-slate-100">
                            <img
                              src={getImageUrl(product.product_image)}
                              alt={product.product_name}
                              onError={handleProductImageError}
                              className={`h-full w-full object-cover transition ${isOutOfStock ? "grayscale" : "hover:scale-105"
                                }`}
                            />

                            {isOutOfStock && (
                              <div className="absolute inset-0 grid place-items-center bg-black/20">
                                <span className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-gray-700">
                                  OUT OF STOCK
                                </span>
                              </div>
                            )}

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
                                {formatCurrency(product.selling_price)}
                              </strong>

                              <span
                                className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${isOutOfStock
                                    ? "bg-gray-200 text-gray-600"
                                    : isLowStock
                                      ? "bg-orange-100 text-orange-600"
                                      : "bg-[#e2f0f5] text-[#4c7891]"
                                  }`}
                              >
                                {isOutOfStock
                                  ? "Out of Stock"
                                  : `${product.quantity_in_stock} in stock`}
                              </span>
                            </div>
                          </div>
                        </article>
                      );
                    })
                )}
              </section>
            </>
          )}
        </motion.main>

        {/* CART */}
        {!showSalesHistory && (
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
                    onError={handleProductImageError}
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
                      {formatCurrency(item.subtotal)}
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
                {formatCurrency(subtotal)}
              </strong>
            </div>

            <div className="mb-3 flex justify-between text-sm text-[#6f84a1]">
            <span>Discount ({discountPercent}%)</span>
            <strong className="text-red-500">
                - {formatCurrency(discountAmount)}
            </strong>
            </div>

            <div className="mb-4 flex justify-between text-sm text-[#6f84a1]">
              <span>Tax ({taxRate}%)</span>
              <strong className="text-[#17325c]">{formatCurrency(tax)}</strong>
            </div>

            <div className="mb-5 flex justify-between border-t border-dashed border-[#cde0ec] pt-4 text-lg font-extrabold">
              <span>Total Amount</span>
              <strong className="text-xl text-orange-600">
                {formatCurrency(total)}
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
                onClick={openHoldList}
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
        )}
      </div>

      {toast.show && (
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="flex items-center gap-3 bg-green-600 text-white px-6 py-4 rounded-xl shadow-xl animate-slideUp">
            <CheckCircle size={18} /> {toast.message}
            </div>
        </div>
    )}

    {showHelp && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
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

    {showEmailPopup && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="w-[380px] rounded-3xl bg-white p-6 shadow-2xl">
          
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#07102f]">
              Send Receipt
            </h2>

            <button
              onClick={() => setShowEmailPopup(false)}
              className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          <input
            type="email"
            placeholder="Enter customer email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mb-5 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
          />

          <button
            onClick={sendReceiptEmail}
            disabled={emailSending}
            className="w-full rounded-full bg-[#0c2f73] py-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {emailSending ? "Sending..." : "Send Email"}
          </button>
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

            <div className="mb-5 flex items-center rounded-2xl bg-[#d8eef9] px-5 py-4 text-[#0c2f73]">
                <input
                autoFocus
                inputMode="decimal"
                value={discountInput}
                onChange={(event) => updateDiscountInput(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                    setShowDiscountPad(false);
                    }
                }}
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent text-right text-3xl font-extrabold outline-none placeholder:text-[#6f85a3]"
                />
                <span className="ml-2 text-3xl font-extrabold">%</span>
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
                type="button"
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

                {heldOrders.length === 0 ? (
                    <div className="rounded-2xl bg-[#eef6fb] p-5 text-center text-sm font-semibold text-[#6f84a1]">
                    No hold orders found.
                    </div>
                ) : (
                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {heldOrders.map(
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
                                {formatCurrency(order.total)}
                            </p>
                            </div>

                            <p className="mb-3 text-sm text-[#6f84a1]">
                            Items: {order.items.length} | Discount:{" "}
                            {order.discountPercent || 0}%
                            </p>

                            <p className="mb-3 text-sm font-semibold text-[#254e7a]">
                            {formatHoldExpiry(order.expiresAt, holdCountdownNow)}
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

    {SHOW_LEGACY_SALES_HISTORY_MODAL && showSalesHistory && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="flex max-h-[86vh] w-[720px] flex-col rounded-3xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-[#07102f]">
                Sales History
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#6f85a3]">
                {user?.branch_name || "Branch"}
              </p>
            </div>

            <button
              onClick={() => setShowSalesHistory(false)}
              className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
            >
              Close
            </button>
          </div>

          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-[#eef6fb] px-4 py-3">
            <Search size={18} className="text-[#0c2f73]" />
            <input
              value={salesHistorySearch}
              onChange={(event) => setSalesHistorySearch(event.target.value)}
              placeholder="Search receipt, cashier, or payment..."
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#8aa0b7]"
            />
          </div>

          <div className="min-h-[260px] flex-1 overflow-y-auto pr-1">
            {loadingSalesHistory ? (
              <div className="grid min-h-[240px] place-items-center text-center text-[#8ba3bc]">
                <div>
                  <ReceiptText size={38} className="mx-auto mb-3" />
                  <p>Loading sales history...</p>
                </div>
              </div>
            ) : filteredSalesHistory.length === 0 ? (
              <div className="grid min-h-[240px] place-items-center text-center text-[#8ba3bc]">
                <div>
                  <ReceiptText size={38} className="mx-auto mb-3" />
                  <p>No sales records found.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSalesHistory.map((sale) => {
                  const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;

                  return (
                    <div
                      key={sale.sale_id}
                      className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-[#e4eef7] bg-[#f8fbfe] p-4"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-[#07102f]">
                            #{sale.sale_code || `RP-${sale.sale_id}`}
                          </h3>
                          <span className="rounded-full bg-[#dff3fb] px-3 py-1 text-xs font-extrabold text-[#0c2f73]">
                            {sale.payment_method || "N/A"}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-[#526b86]">
                          {sale.user_name || "Cashier"} •{" "}
                          {saleDate
                            ? `${saleDate.toLocaleDateString()} ${saleDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : "Date unavailable"}
                        </p>
                      </div>

                      <div className="flex flex-col items-end justify-between gap-3">
                        <strong className="text-lg text-orange-600">
                          {formatCurrency(sale.total_amount)}
                        </strong>
                        <button
                          onClick={() => reprintSaleReceipt(sale)}
                          className="flex items-center gap-2 rounded-full bg-[#0c2f73] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#103986]"
                        >
                          <Printer size={15} />
                          Reprint
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {showSettings && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="w-[460px] rounded-3xl bg-white p-7 shadow-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-[#07102f]">
              POS Settings
            </h2>

            <button
              onClick={() => setShowSettings(false)}
              className="rounded-full bg-[#eef6fb] px-3 py-1 text-sm font-bold text-[#254e7a]"
            >
              ✕
            </button>
          </div>

          <div className="space-y-5 text-sm text-[#17325c]">
            <div>
              <label className="mb-2 block font-extrabold">Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
              />
            </div>

            <div>
              <label className="mb-2 block font-extrabold">Terminal Name</label>
              <input
                type="text"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
              />
            </div>

            <div>
              <label className="mb-2 block font-extrabold">
                Receipt Footer Message
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#0c2f73]"
              />
            </div>

          <div className="flex items-center justify-between rounded-2xl bg-[#eef6fb] p-4">
            <div>
              <p className="font-extrabold">Eye Care Mode</p>
              <p className="text-xs text-[#6f84a1]">
                Reduce eye strain with softer colors
              </p>
            </div>

            <button
              onClick={() => setEyeCareMode(!eyeCareMode)}
              className={`relative h-7 w-14 rounded-full transition ${
                eyeCareMode ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                  eyeCareMode ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>

              <div className="mt-7 grid grid-cols-2 gap-4">
            <button
              onClick={() => setShowSettings(false)}
              className="rounded-full border border-[#0c2f73] bg-white py-4 font-extrabold text-[#0c2f73]"
            >
              Cancel
            </button>

            <button
              onClick={() => {
                sessionStorage.setItem("taxRate", taxRate);
                sessionStorage.setItem("terminalName", terminalName);
                sessionStorage.setItem("receiptFooter", receiptFooter);
                sessionStorage.setItem("eyeCareMode", eyeCareMode);

                setShowSettings(false);

                setToast({
                  show: true,
                  message: "Settings saved successfully",
                });

                setTimeout(() => {
                  setToast({ show: false, message: "" });
                }, 2500);
              }}
              className="rounded-full bg-[#0c2f73] py-4 font-extrabold text-white"
            >
              Save Settings
            </button>
                      </div>
                    </div>
                  </div>
                </div>
            )}
    
    {showPaymentModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[680px] overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-8 py-6">
          <h2 className="text-2xl font-extrabold text-[#07102f]">
            Complete Payment
          </h2>

          <button onClick={() => setShowPaymentModal(false)}>
            <X size={24} />
          </button>
        </div>

        <div className="px-8 py-7">
          <div className="mb-7 rounded-xl bg-[#e4f4fc] p-6">
            <div className="mb-3 flex justify-between">
              <span>Total Items</span>
              <strong>{cart.reduce((sum, item) => sum + item.quantity, 0)}</strong>
            </div>

            <div className="mb-3 flex justify-between">
              <span>Subtotal</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>

            <div className="mb-3 flex justify-between">
              <span>Discount ({discountPercent}%)</span>
              <strong>- {formatCurrency(discountAmount)}</strong>
            </div>

            <div className="mb-4 flex justify-between">
              <span>Tax ({taxRate}%)</span>
              <strong>{formatCurrency(tax)}</strong>
            </div>

            <div className="flex justify-between border-t pt-5">
              <span className="font-extrabold tracking-widest">GRAND TOTAL</span>
              <strong className="text-4xl font-extrabold text-[#071b52]">
                {formatCurrency(total)}
              </strong>
            </div>
          </div>

          <h3 className="mb-4 text-sm font-extrabold tracking-widest text-[#333647]">
            SELECT PAYMENT METHOD
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setPaymentMethod("CASH")}
              className={`relative rounded-xl border p-6 font-extrabold ${
                paymentMethod === "CASH"
                  ? "bg-[#0c2f73] text-white"
                  : "bg-white text-[#07102f]"
              }`}
            >
              <Banknote className="mx-auto mb-3" size={32} />
              Cash
              {paymentMethod === "CASH" && (
                <CheckCircle className="absolute right-3 top-3 text-orange-500" />
              )}
            </button>

            <button
              onClick={() => setPaymentMethod("CARD")}
              className={`relative rounded-xl border p-6 font-extrabold ${
                paymentMethod === "CARD"
                  ? "bg-[#0c2f73] text-white"
                  : "bg-white text-[#07102f]"
              }`}
            >
              <CreditCard className="mx-auto mb-3" size={32} />
              Card
              {paymentMethod === "CARD" && (
                <CheckCircle className="absolute right-3 top-3 text-orange-500" />
              )}
            </button>

            <button
              onClick={() => setPaymentMethod("E_WALLET")}
              className={`relative rounded-xl border p-6 font-extrabold ${
                paymentMethod === "E_WALLET"
                  ? "bg-[#0c2f73] text-white"
                  : "bg-white text-[#07102f]"
              }`}
            >
              <Wallet className="mx-auto mb-3" size={32} />
              E-Wallet
              {paymentMethod === "E_WALLET" && (
                <CheckCircle className="absolute right-3 top-3 text-orange-500" />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 bg-[#eef8fd] px-8 py-6">
          <button
            onClick={() => setShowPaymentModal(false)}
            className="rounded-xl py-4 font-extrabold text-[#333647]"
          >
            Cancel
          </button>

          <button
            onClick={confirmPayment}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#0c2f73] py-4 font-extrabold text-white shadow-lg"
          >
            <ShieldCheck size={20} />
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
      )}

    {paymentSuccess && completedSale && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#eef6fb] px-8 py-8">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-[#07102f]">
                {completedSale.isReprint ? "Receipt Reprint" : "Transaction Complete"}
              </h1>
              <p className="text-sm text-[#4e6077]">
                Sale ID: #{completedSale.sale_code} •{" "}
                {user?.branch_name || "Branch"}
              </p>
            </div>

            <span className="rounded-md bg-[#dff3fb] px-4 py-2 text-xs font-extrabold tracking-widest text-[#07102f]">
              {completedSale.isReprint ? "REPRINT" : "CONFIRMED"}
            </span>
          </div>

          {/* RECEIPT PREVIEW */}
          <div id="receipt-pdf" className="receipt-print-surface mx-auto bg-white p-10 shadow-xl">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-extrabold text-[#07102f]">
                RetailPulse
              </h2>
              <p className="mt-2 font-bold">
                {completedSale.branch_name || user?.branch_name || "Branch"}
              </p>
              <p className="text-sm text-[#4e6077]">RetailPulse POS System</p>
            </div>

            <div className="receipt-print-meta mb-7 grid grid-cols-2 gap-4 rounded-2xl bg-[#f3f9fd] p-6 text-sm">
              <div>
                <p className="text-xs font-bold tracking-widest text-[#8b95a1]">
                  DATE & TIME
                </p>
                <strong>
                  {completedSale.date.toLocaleDateString()} |{" "}
                  {completedSale.date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
              </div>

              <div className="text-right">
                <p className="text-xs font-bold tracking-widest text-[#8b95a1]">
                  SALE ID
                </p>
                <strong>#{completedSale.sale_code}</strong>
              </div>

              <div>
                <p className="text-xs font-bold tracking-widest text-[#8b95a1]">
                  CASHIER
                </p>
                <strong>{completedSale.cashier_name || user?.name || "Staff"}</strong>
              </div>

              <div className="text-right">
                <p className="text-xs font-bold tracking-widest text-[#8b95a1]">
                  TERMINAL
                </p>
                <strong>{terminalName}</strong>
              </div>
            </div>

            <div className="receipt-print-items-head mb-5 grid grid-cols-[1fr_80px_120px] text-xs font-extrabold tracking-widest text-[#8b95a1]">
              <span>ITEM DESCRIPTION</span>
              <span className="text-center">QTY</span>
              <span className="text-right">TOTAL</span>
            </div>

            {completedSale.cart.map((item) => (
              <div
                key={item.product_id}
                className="receipt-print-item mb-4 grid grid-cols-[1fr_80px_120px] items-start text-sm"
              >
                <div>
                  <strong>{item.product_name}</strong>
                  <p className="text-xs text-[#4e6077]">
                    {formatCurrency(item.selling_price)} / unit
                  </p>
                </div>

                <span className="text-center font-bold">{item.quantity}</span>

                <strong className="text-right">
                  {formatCurrency(Number(item.selling_price) * item.quantity)}
                </strong>
              </div>
            ))}

            <div className="receipt-print-divider my-6 border-t border-dashed"></div>

            <div className="receipt-print-totals space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <strong>{formatCurrency(completedSale.subtotal)}</strong>
              </div>

              <div className="flex justify-between">
                <span>Discount</span>
                <strong>- {formatCurrency(completedSale.discountAmount)}</strong>
              </div>

              <div className="flex justify-between">
                <span>
                  Tax {completedSale.taxRate !== null && completedSale.taxRate !== undefined ? `(${completedSale.taxRate}%)` : ""}
                </span>
                <strong>{formatCurrency(completedSale.tax)}</strong>
              </div>

              <div className="receipt-print-grand-total flex justify-between rounded-md bg-[#071b52] px-5 py-4 text-xl font-extrabold text-white">
                <span>Grand Total</span>
                <strong>{formatCurrency(completedSale.total)}</strong>
              </div>
            </div>

            <div className="receipt-print-payment mt-7 flex items-center justify-between border-b pb-5">
              <div className="flex items-center gap-3">
                <CreditCard size={22} />
                <div>
                  <p className="text-xs font-bold tracking-widest text-[#8b95a1]">
                    PAYMENT METHOD
                  </p>
                  <strong>{completedSale.payment_method}</strong>
                </div>
              </div>

              <span className="rounded bg-gray-200 px-3 py-1 text-xs font-bold">
                APPROVED
              </span>
            </div>

            <p className="mt-7 text-center font-semibold">
              {receiptFooter}
            </p>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-4">
           <button
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 rounded-full border border-[#0c2f73] bg-[#0c2f73] px-6 py-4 font-extrabold text-white transition-all duration-300 hover:bg-white hover:text-[#0c2f73] hover:shadow-lg"
            >
              <Printer size={18} />
              Print Receipt
            </button>

            <button
              onClick={() =>
                downloadPDF({
                  elementId: "receipt-pdf",
                  fileName: `RetailPulse_Receipt_${completedSale.sale_code}.pdf`,
                })
              }
              className="flex items-center justify-center gap-2 rounded-full border border-[#0c2f73] bg-[#0c2f73] px-6 py-4 font-extrabold text-white transition-all duration-300 hover:bg-white hover:text-[#0c2f73]"
            >
              <Download size={18} />
              Download PDF
            </button>

            <button
            onClick={() => setShowEmailPopup(true)}
            className="flex items-center justify-center gap-2 rounded-full border border-[#0c2f73] bg-[#0c2f73] px-6 py-4 font-extrabold text-white transition-all duration-300 hover:bg-white hover:text-[#0c2f73]"
          >
            <Mail size={18} />
            Email Receipt
          </button>
          </div>

          <button
            onClick={() => {
              setPaymentSuccess(false);
              setCompletedSale(null);
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-orange-700 bg-orange-700 px-6 py-4 font-extrabold text-white transition-all duration-300 hover:bg-white hover:text-orange-700 hover:shadow-lg"
          >
            <ShoppingCart size={20} />
            New Sale
          </button>
        </div>
      </div>
    )}
    </motion.div>
  );
}

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
import "./StaffPOS.css";

const API_BASE = "http://localhost:5000";

function StaffPOS() {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = JSON.parse(sessionStorage.getItem("user"));
    setUser(savedUser);

    if (!savedUser) {
      window.location.href = "/";
      return;
    }

    fetchPOSData(savedUser);
  }, []);

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

      const branchInventory = inventoryData.filter(
        (item) => Number(item.branch_id) === Number(savedUser.branch_id)
      );

      setInventory(branchInventory);
    } catch (error) {
      console.error("Failed to fetch POS data:", error);
      alert("Failed to load POS data. Please check backend server.");
    } finally {
      setLoading(false);
    }
  };

  const productsWithStock = useMemo(() => {
    return products.map((product) => {
      const stockRecord = inventory.find(
        (item) => Number(item.product_id) === Number(product.product_id)
      );

      return {
        ...product,
        quantity_in_stock: stockRecord ? stockRecord.quantity_in_stock : 0,
        branch_id: stockRecord ? stockRecord.branch_id : user?.branch_id,
      };
    });
  }, [products, inventory, user]);

  const filteredProducts = useMemo(() => {
    return productsWithStock.filter((product) => {
      const matchCategory =
        activeCategory === "ALL" ||
        Number(product.category_id) === Number(activeCategory);

      const keyword = searchTerm.toLowerCase();

      const matchSearch =
        product.product_name.toLowerCase().includes(keyword) ||
        product.product_code.toLowerCase().includes(keyword) ||
        product.category_name.toLowerCase().includes(keyword);

      return matchCategory && matchSearch;
    });
  }, [productsWithStock, activeCategory, searchTerm]);

  const getImageUrl = (imagePath) => {
    if (!imagePath) {
      return "https://placehold.co/600x400?text=No+Image";
    }

    if (imagePath.startsWith("http")) {
      return imagePath;
    }

    return `${API_BASE}${imagePath}`;
  };

  const addToCart = (product) => {
    if (product.quantity_in_stock <= 0) {
      alert("This product is out of stock.");
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.product_id === product.product_id
      );

      if (existingItem) {
        if (existingItem.quantity >= product.quantity_in_stock) {
          alert("Cannot add more than available stock.");
          return prevCart;
        }

        return prevCart.map((item) =>
          item.product_id === product.product_id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.selling_price,
              }
            : item
        );
      }

      return [
        ...prevCart,
        {
          ...product,
          quantity: 1,
          subtotal: product.selling_price,
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
          subtotal: (item.quantity + 1) * item.selling_price,
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
                subtotal: (item.quantity - 1) * item.selling_price,
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

  const clearCart = () => {
    setCart([]);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const completeTransaction = async () => {
    if (cart.length === 0) {
      alert("Cart is empty.");
      return;
    }

    alert(
      "UI is ready. Next step: create a backend endpoint to save sale, sale_detail, and deduct inventory in one transaction."
    );
  };

  const logout = () => {
    sessionStorage.removeItem("user");
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="staffpos-loading">
        <Package size={38} />
        <p>Loading POS Terminal...</p>
      </div>
    );
  }

  return (
    <div className="staffpos-page">
      <aside className="staffpos-sidebar">
        <div className="staffpos-logo">
          <span>Retail</span>Pulse
        </div>

        <div className="staffpos-branch-card">
          <h4>{user?.branch_name || "Branch"}</h4>
          <p>Staff ID: {user?.user_id}</p>
        </div>

        <nav className="staffpos-nav">
          <button className="staffpos-nav-item active">
            <ShoppingCart size={18} />
            <span>POS Terminal</span>
          </button>

          <button className="staffpos-nav-item"
             onClick={() => navigate("/staff-analytics")}>
            <BarChart3 size={18} />
            <span>Analytics</span>
          </button>

          <button className="staffpos-nav-item">
            <User size={18} />
            <span>User Profile</span>
          </button>
        </nav>

        <div className="staffpos-sidebar-bottom">
          <button className="staffpos-help">
            <HelpCircle size={17} />
            <span>Help Support</span>
          </button>

          <button className="staffpos-logout" onClick={logout}>
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="staffpos-main">
        <header className="staffpos-header">
          <div className="staffpos-header-left">
            <button className="staffpos-top-link">Dashboard</button>
            <button className="staffpos-top-link active">Inventory</button>
          </div>

          <div className="staffpos-search-box">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search SKU or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="staffpos-header-actions">
            <button>
              <Bell size={18} />
            </button>
            <button>
              <Settings size={18} />
            </button>
            <div className="staffpos-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
          </div>
        </header>

        <section className="staffpos-category-row">
          <button
            className={`staffpos-category-pill ${
              activeCategory === "ALL" ? "active" : ""
            }`}
            onClick={() => setActiveCategory("ALL")}
          >
            All Products
          </button>

          {categories.map((category) => (
            <button
              key={category.category_id}
              className={`staffpos-category-pill ${
                Number(activeCategory) === Number(category.category_id)
                  ? "active"
                  : ""
              }`}
              onClick={() => setActiveCategory(category.category_id)}
            >
              {category.category_name}
            </button>
          ))}
        </section>

        <section className="staffpos-products-grid">
          {filteredProducts.length === 0 ? (
            <div className="staffpos-empty-products">
              <Package size={38} />
              <p>No products found.</p>
            </div>
          ) : (
            filteredProducts.map((product) => (
              <article
                key={product.product_id}
                className="staffpos-product-card"
                onClick={() => addToCart(product)}
              >
                <div className="staffpos-product-image-wrap">
                  <img
                    src={getImageUrl(product.product_image)}
                    alt={product.product_name}
                    className="staffpos-product-image"
                  />

                  <span className="staffpos-product-category">
                    {product.category_name}
                  </span>
                </div>

                <div className="staffpos-product-info">
                  <h3>{product.product_name}</h3>
                  <p>SKU: {product.product_code}</p>

                  <div className="staffpos-product-bottom">
                    <strong>RM {Number(product.selling_price).toFixed(2)}</strong>

                    <span
                      className={`staffpos-stock-badge ${
                        product.quantity_in_stock <= product.reorder_level
                          ? "danger"
                          : ""
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
      </main>

      <aside className="staffpos-cart">
        <div className="staffpos-cart-header">
          <h2>Current Cart</h2>

          <button onClick={clearCart}>
            <Trash2 size={14} />
            Clear All
          </button>
        </div>

        <div className="staffpos-cart-list">
          {cart.length === 0 ? (
            <div className="staffpos-empty-cart">
              <ShoppingCart size={36} />
              <p>No items added yet.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div className="staffpos-cart-item" key={item.product_id}>
                <img src={getImageUrl(item.product_image)} alt={item.product_name} />

                <div className="staffpos-cart-info">
                  <h4>{item.product_name}</h4>
                  <p>{item.product_code}</p>

                  <div className="staffpos-cart-control">
                    <button onClick={() => decreaseQty(item.product_id)}>
                      <Minus size={13} />
                    </button>

                    <span>{item.quantity}</span>

                    <button onClick={() => increaseQty(item.product_id)}>
                      <Plus size={13} />
                    </button>
                  </div>
                </div>

                <div className="staffpos-cart-price">
                  <strong>RM {item.subtotal.toFixed(2)}</strong>
                  <button onClick={() => removeFromCart(item.product_id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="staffpos-cart-summary">
          <div>
            <span>Subtotal ({cart.length} items)</span>
            <strong>RM {subtotal.toFixed(2)}</strong>
          </div>

          <div>
            <span>Tax (8%)</span>
            <strong>RM {tax.toFixed(2)}</strong>
          </div>

          <div className="staffpos-total-row">
            <span>Total Amount</span>
            <strong>RM {total.toFixed(2)}</strong>
          </div>

          <button className="staffpos-complete-btn" onClick={completeTransaction}>
            <CreditCard size={17} />
            Complete Transaction
          </button>

          <div className="staffpos-cart-actions">
            <button>
              <ReceiptText size={15} />
              Print Hold
            </button>

            <button>
              <Plus size={15} />
              Add Discount
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default StaffPOS;
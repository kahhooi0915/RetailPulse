import "./App.css";

function AdminDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user"));

  const handleLogout = () => {
    sessionStorage.removeItem("user");
    window.location.href = "/";
  };

  return (
    <div className="new-dashboard">
      <aside className="new-sidebar">
        <div>
          <div className="new-logo-box">
            <div className="new-logo-icon">🏪</div>
            <div>
              <h2>RETAILPULSE</h2>
              <p>Admin</p>
            </div>
          </div>

          <nav className="new-menu">
            <div className="new-menu-item">POS Terminal</div>
            <div className="new-menu-item">Inventory</div>
            <div className="new-menu-item active">Sales Analytics</div>
            <div className="new-menu-item">Admin Panel</div>
          </nav>
        </div>

        <div className="new-user-box">
          <div className="user-circle">
            {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
          </div>
          <div className="user-info">
            <strong>{user?.email || "admin@gmail.com"}</strong>
          </div>
          <button className="logout-mini-btn" onClick={handleLogout}>↪</button>
        </div>
      </aside>

      <main className="new-main">
        <div className="new-topbar">
          <div>
            <h1>Sales Analytics</h1>
            <p>Performance insights across all branches</p>
          </div>

          <select className="top-filter">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>Last 6 Months</option>
          </select>
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <span>Total Revenue</span>
            <h2>RM 9.50</h2>
          </div>

          <div className="summary-card">
            <span>Transactions</span>
            <h2>1</h2>
          </div>

          <div className="summary-card">
            <span>Avg. Sale</span>
            <h2>RM 9.50</h2>
          </div>

          <div className="summary-card">
            <span>Products Sold</span>
            <h2>3</h2>
          </div>
        </div>

        <div className="chart-grid">
          <div className="chart-card large">
            <h3>Sales Trend</h3>
            <div className="fake-chart-area">
              <div className="fake-axis-y">
                <span>12</span>
                <span>9</span>
                <span>6</span>
                <span>3</span>
                <span>0</span>
              </div>
              <div className="fake-axis-x">12 Apr</div>
            </div>
          </div>

          <div className="chart-card">
            <h3>Revenue by Branch</h3>
            <div className="fake-pie-wrap">
              <div className="fake-pie"></div>
              <p>signed (100%)</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
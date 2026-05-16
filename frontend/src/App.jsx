import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Staff from "./pages/Staff";
import Manager from "./pages/Manager";
import StaffAnalytics from "./pages/StaffAnalytics";
import UserProfile from "./pages/UserProfile";
import ManagerStockTransfer from "./pages/ManagerStockTransfer";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerBranchInventory from "./pages/ManagerBranchInventory";
import AdminDashboard from "./pages/AdminDashboard";
import AdminReportsForecasting from "./pages/AdminReportsForecasting";
import AdminUserManagement from "./pages/AdminUserManagement";
import AdminBranchManagement from "./pages/AdminBranchManagement";
import AdminCatalogManagement from "./pages/AdminCatalogManagement";
import AdminSalesMonitoring from "./pages/AdminSalesMonitoring";
import AdminInventoryOverview from "./pages/AdminInventoryOverview";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/staff-analytics" element={<StaffAnalytics />} />
        <Route path="/user-profile" element={<UserProfile />} />
        <Route path="/manager-stock-transfer" element={<ManagerStockTransfer />} />
        <Route path="/manager-dashboard" element={<ManagerDashboard />} />
        <Route path="/manager-inventory" element={<ManagerBranchInventory />} />
        <Route path="/admin/reports" element={<AdminReportsForecasting />} />
        <Route path="/admin/users" element={<AdminUserManagement />} />
        <Route path="/admin/branches" element={<AdminBranchManagement />} />
        <Route path="/admin/catalog" element={<AdminCatalogManagement />} />
        <Route path="/admin/sales" element={<AdminSalesMonitoring />} />  
        <Route path="/admin/inventory" element={<AdminInventoryOverview />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
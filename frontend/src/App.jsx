import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import setFavicon from "./utils/setFavicon";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
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
import AdminSupplierManagement from "./pages/AdminSupplierManagement";
import AdminPurchaseManagement from "./pages/AdminPurchaseManagement";
import AdminWarehouseManagement from "./pages/AdminWarehouseManagement";
import AdminActivityLog from "./pages/AdminActivityLog";
import DatabaseBackup from "./pages/DatabaseBackup";
import FloatingAIAssistant from "./components/FloatingAIAssistant";

function AppContent() {
  const location = useLocation();

  useEffect(() => {
    const user = JSON.parse(sessionStorage.getItem("user"));
    setFavicon(user?.role);
  }, [location.pathname]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/staff-analytics" element={<StaffAnalytics />} />
        <Route path="/staff/analytics" element={<StaffAnalytics />} />
        <Route path="/staff/request-stock" element={<StaffAnalytics />} />
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
        <Route path="/admin/warehouse" element={<AdminWarehouseManagement />} />
        <Route path="/admin/suppliers" element={<AdminSupplierManagement />} />
        <Route path="/admin/purchases" element={<AdminPurchaseManagement />} />
        <Route path="/admin/activity-log" element={<AdminActivityLog />} />
        <Route path="/admin/database-backup" element={<DatabaseBackup />} />
      </Routes>
      <FloatingAIAssistant />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );

}

export default App;

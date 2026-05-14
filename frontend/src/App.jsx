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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
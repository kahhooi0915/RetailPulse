import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./Login";
import Register from "./Register";
import AdminDashboard from "./AdminDashboard";
import StaffPOS from "./StaffPOS";
import StaffAnalytics from "./StaffAnalytics";
import "./App.css";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/staff-pos" element={<StaffPOS />} />
        <Route path="/staff-analytics" element={<StaffAnalytics />} />
      </Routes>
    </Router>
  );
}

export default App;
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppStoreProvider } from "./store/AppStore";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Schedule from "./pages/Schedule";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Stock from "./pages/Stock";
import Purchases from "./pages/Purchases";
import Services from "./pages/Services";
import Clients from "./pages/Clients";
import Employees from "./pages/Employees";
import Finance from "./pages/Finance";
import Reports from "./pages/Reports";
import NewOrder from "./pages/NewOrder";
import Settings from "./pages/Settings";

function App() {
  return (
    <AppStoreProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/new" element={<NewOrder />} />
              <Route path="orders/:orderId" element={<OrderDetail />} />
              <Route path="stock" element={<Stock />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="services" element={<Services />} />
              <Route path="clients" element={<Clients />} />
              <Route path="employees" element={<Employees />} />
              <Route path="finance" element={<Finance />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AppStoreProvider>
  );
}

export default App;

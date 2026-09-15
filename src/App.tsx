import { HashRouter, Route, Routes } from "react-router-dom";
import { AppStoreProvider } from "./store/AppStore";
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

function App() {
  return (
    <AppStoreProvider>
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
          </Route>
        </Routes>
      </HashRouter>
    </AppStoreProvider>
  );
}

export default App;

import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { AppStoreProvider, useAppStore } from "./store/AppStore";
import { AuthProvider } from "./auth/AuthContext";
import AuthGate from "./auth/AuthGate";
import { canOpenPath, homePathForRole } from "./lib/access";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/Confirm";
import { MobileMenuProvider } from "./components/MobileMenu";
import Layout from "./components/Layout";
import AppErrorBoundary from "./components/AppErrorBoundary";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Stock = lazy(() => import("./pages/Stock"));
const Purchases = lazy(() => import("./pages/Purchases"));
const Services = lazy(() => import("./pages/Services"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Employees = lazy(() => import("./pages/Employees"));
const Finance = lazy(() => import("./pages/Finance"));
const Reports = lazy(() => import("./pages/Reports"));
const NewOrder = lazy(() => import("./pages/NewOrder"));
const Settings = lazy(() => import("./pages/Settings"));
const OrderPrint = lazy(() => import("./pages/OrderPrint"));
const MyWork = lazy(() => import("./pages/MyWork"));
const Documents = lazy(() => import("./pages/Documents"));
const Reputation = lazy(() => import("./pages/Reputation"));

function RoleRoute({ path, children }: { path: string; children: ReactNode }) {
  const { cloud } = useAppStore();
  if (cloud.role && !canOpenPath(cloud.role, path)) return <Navigate to="/" replace />;
  return children;
}

function RoleHome() {
  const { cloud } = useAppStore();
  const target = homePathForRole(cloud.role);
  if (target !== "/") return <Navigate to={target} replace />;
  return <Dashboard />;
}

function AppRoutes() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <MobileMenuProvider>
          <HashRouter>
            <AppErrorBoundary>
            <Suspense fallback={<div className="p-6 text-sm muted">Загрузка раздела…</div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<RoleHome />} />
                <Route path="schedule" element={<RoleRoute path="/schedule"><Schedule /></RoleRoute>} />
                <Route path="orders" element={<RoleRoute path="/orders"><Orders /></RoleRoute>} />
                <Route path="orders/new" element={<RoleRoute path="/orders"><NewOrder /></RoleRoute>} />
                <Route path="orders/:orderId" element={<RoleRoute path="/orders"><OrderDetail /></RoleRoute>} />
                <Route path="orders/:orderId/print" element={<RoleRoute path="/orders"><OrderPrint /></RoleRoute>} />
                <Route path="documents" element={<RoleRoute path="/documents"><Documents /></RoleRoute>} />
                <Route path="stock" element={<RoleRoute path="/stock"><Stock /></RoleRoute>} />
                <Route path="purchases" element={<RoleRoute path="/purchases"><Purchases /></RoleRoute>} />
                <Route path="services" element={<RoleRoute path="/services"><Services /></RoleRoute>} />
                <Route path="clients" element={<RoleRoute path="/clients"><Clients /></RoleRoute>} />
                <Route path="clients/:clientId" element={<RoleRoute path="/clients"><ClientDetail /></RoleRoute>} />
                <Route path="reputation" element={<RoleRoute path="/reputation"><Reputation /></RoleRoute>} />
                <Route path="employees" element={<RoleRoute path="/employees"><Employees /></RoleRoute>} />
                <Route path="finance" element={<RoleRoute path="/finance"><Finance /></RoleRoute>} />
                <Route path="reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
                <Route path="settings" element={<RoleRoute path="/settings"><Settings /></RoleRoute>} />
                <Route path="my-work" element={<RoleRoute path="/my-work"><MyWork /></RoleRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            </Suspense>
            </AppErrorBoundary>
          </HashRouter>
        </MobileMenuProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppStoreProvider>
          <AppRoutes />
        </AppStoreProvider>
      </AuthGate>
    </AuthProvider>
  );
}

export default App;

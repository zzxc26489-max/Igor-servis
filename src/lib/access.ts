import type { CloudRole } from "./cloud";

export const ROLE_LABELS: Record<CloudRole, string> = {
  owner: "Владелец",
  partner: "Партнёр",
  advisor: "Приёмщик",
  parts: "Запчастист",
  mechanic: "Механик",
  accountant: "Бухгалтер",
};

export function canOpenPath(role: CloudRole, path: string) {
  if (role === "owner" || role === "partner") return true;

  if (role === "mechanic") {
    return path === "/my-work";
  }

  if (role === "accountant") {
    return (
      path === "/finance" ||
      path === "/reports" ||
      path === "/employees" ||
      path === "/documents"
    );
  }

  if (role === "advisor") {
    return (
      path === "/" ||
      path.startsWith("/schedule") ||
      path.startsWith("/orders") ||
      path.startsWith("/clients") ||
      path.startsWith("/stock")
    );
  }

  return (
    path === "/" ||
    path.startsWith("/orders") ||
    path.startsWith("/stock") ||
    path.startsWith("/purchases")
  );
}

export function homePathForRole(role?: CloudRole) {
  if (role === "mechanic") return "/my-work";
  if (role === "accountant") return "/finance";
  return "/";
}

export function canManageSettings(role: CloudRole) {
  return role === "owner" || role === "partner";
}

export function canSeeFinance(role: CloudRole) {
  return role === "owner" || role === "partner" || role === "accountant";
}

export function canManageStock(role: CloudRole) {
  return role === "owner" || role === "partner" || role === "parts";
}

export function canManagePayroll(role: CloudRole) {
  return role === "owner" || role === "partner" || role === "accountant";
}

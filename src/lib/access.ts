import type { CloudRole } from "./cloud";

export const ROLE_LABELS: Record<CloudRole, string> = {
  owner: "Владелец",
  partner: "Партнёр",
  advisor: "Приёмщик",
  parts: "Запчастист",
};

export function canOpenPath(role: CloudRole, path: string) {
  if (role === "owner" || role === "partner") return true;
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

export function canManageSettings(role: CloudRole) {
  return role === "owner" || role === "partner";
}

export function canSeeFinance(role: CloudRole) {
  return role === "owner" || role === "partner";
}


export function canManageStock(role: CloudRole) {
  return role === "owner" || role === "partner" || role === "parts";
}

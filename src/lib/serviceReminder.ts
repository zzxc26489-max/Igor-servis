import type { Vehicle } from "../types.ts";

export type ServiceReminderTone = "overdue" | "soon";

export interface ServiceReminder {
  vehicleId: string;
  tone: ServiceReminderTone;
  label: string;
  daysLeft?: number;
  mileageLeft?: number;
}

export function serviceReminder(vehicle: Vehicle, now = new Date()): ServiceReminder | null {
  const labels: string[] = [];
  let overdue = false;
  let soon = false;
  let daysLeft: number | undefined;
  let mileageLeft: number | undefined;

  if (vehicle.nextServiceDate) {
    const due = new Date(`${vehicle.nextServiceDate}T12:00:00`);
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    if (!Number.isNaN(due.getTime())) {
      daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      if (daysLeft < 0) {
        overdue = true;
        labels.push(`дата просрочена на ${Math.abs(daysLeft)} дн.`);
      } else if (daysLeft <= 30) {
        soon = true;
        labels.push(daysLeft === 0 ? "по дате сегодня" : `по дате через ${daysLeft} дн.`);
      }
    }
  }

  if (vehicle.nextServiceMileage && vehicle.mileage) {
    mileageLeft = vehicle.nextServiceMileage - vehicle.mileage;
    if (mileageLeft <= 0) {
      overdue = true;
      labels.push(`пробег превышен на ${Math.abs(mileageLeft).toLocaleString("ru-RU")} км`);
    } else if (mileageLeft <= 1000) {
      soon = true;
      labels.push(`осталось ${mileageLeft.toLocaleString("ru-RU")} км`);
    }
  }

  if (!overdue && !soon) return null;

  return {
    vehicleId: vehicle.id,
    tone: overdue ? "overdue" : "soon",
    label: labels.join(" · "),
    daysLeft,
    mileageLeft,
  };
}

export function serviceReminders(vehicles: Vehicle[], now = new Date()) {
  return vehicles
    .map((vehicle) => serviceReminder(vehicle, now))
    .filter((item): item is ServiceReminder => Boolean(item))
    .sort((a, b) => {
      if (a.tone !== b.tone) return a.tone === "overdue" ? -1 : 1;
      const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
      const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      const aMileage = a.mileageLeft ?? Number.POSITIVE_INFINITY;
      const bMileage = b.mileageLeft ?? Number.POSITIVE_INFINITY;
      return aMileage - bMileage;
    });
}

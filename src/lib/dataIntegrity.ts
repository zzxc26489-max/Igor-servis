import type { Client, Vehicle } from "../types.ts";
import { looksRussian, normalizePlate, normalizeVin, phoneDigits } from "./formats.ts";

export function findClientByPhone(clients: Client[], phone: string, excludeId?: string) {
  const key = phoneDigits(phone);
  if (!key) return undefined;
  return clients.find((client) => client.id !== excludeId && phoneDigits(client.phone) === key);
}

export function findVehicleByPlate(vehicles: Vehicle[], plate: string, excludeId?: string) {
  const key = normalizePlate(plate, looksRussian(plate) ? "ru" : "foreign");
  if (!key) return undefined;
  return vehicles.find((vehicle) => {
    if (vehicle.id === excludeId) return false;
    const vehicleKey = normalizePlate(vehicle.plate, looksRussian(vehicle.plate) ? "ru" : "foreign");
    return vehicleKey === key;
  });
}

export function findVehicleByVin(vehicles: Vehicle[], vin: string, excludeId?: string) {
  const key = normalizeVin(vin);
  if (!key) return undefined;
  return vehicles.find((vehicle) => vehicle.id !== excludeId && normalizeVin(vehicle.vin ?? "") === key);
}

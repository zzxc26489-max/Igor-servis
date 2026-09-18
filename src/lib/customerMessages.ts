import { phoneDigits } from "./formats.ts";

function normalizedMessengerPhone(phone: string) {
  const digits = phoneDigits(phone);
  return digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
}

export function readyMessage(input: {
  clientName?: string;
  vehicle: string;
  orderNumber: string;
  serviceName?: string;
  phone?: string;
}) {
  const greeting = input.clientName ? `${input.clientName}, добрый день!` : "Добрый день!";
  const contact = input.phone ? ` Телефон: ${input.phone}.` : "";
  return `${greeting} Ваш автомобиль ${input.vehicle} готов. Заказ-наряд ${input.orderNumber}. ${input.serviceName ?? "Автосервис"}.${contact}`;
}

export function whatsappMessageHref(phone: string, message: string) {
  const digits = normalizedMessengerPhone(phone);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function smsMessageHref(phone: string, message: string) {
  const digits = normalizedMessengerPhone(phone);
  if (!digits) return "";
  return `sms:+${digits}?body=${encodeURIComponent(message)}`;
}

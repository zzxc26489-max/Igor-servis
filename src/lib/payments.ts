import type { PaymentMethod } from "../types";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  terminal: "Терминал / карта",
  transfer: "Перевод / СБП",
};

export function paymentMethodLabel(method?: PaymentMethod) {
  return method ? PAYMENT_METHOD_LABELS[method] : "Способ не указан";
}

export interface PaymentLike {
  orderId: string;
  at: string;
  amount: number;
  kind?: "payment" | "refund";
  method?: PaymentMethod;
  employee?: string;
  estimated?: boolean;
}

export function paymentInRange(payment: PaymentLike, from: Date, to: Date) {
  const time = new Date(payment.at).getTime();
  return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
}

export function paymentsInRange<T extends PaymentLike>(payments: T[], from: Date, to: Date): T[] {
  return payments.filter((payment) => paymentInRange(payment, from, to));
}

export function signedPaymentAmount(payment: PaymentLike) {
  return payment.kind === "refund" ? -Math.max(0, payment.amount) : Math.max(0, payment.amount);
}

export function receivedInRange(payments: PaymentLike[], from: Date, to: Date) {
  return paymentsInRange(payments, from, to)
    .reduce((sum, payment) => sum + signedPaymentAmount(payment), 0);
}

export function recordedForOrder(payments: PaymentLike[], orderId: string) {
  return payments
    .filter((payment) => payment.orderId === orderId)
    .reduce((sum, payment) => sum + signedPaymentAmount(payment), 0);
}

export function paymentMethodSummary(payments: PaymentLike[], from: Date, to: Date) {
  return paymentsInRange(payments, from, to).reduce(
    (summary, payment) => {
      const method = payment.method ?? "unknown";
      summary[method] += signedPaymentAmount(payment);
      return summary;
    },
    { cash: 0, terminal: 0, transfer: 0, unknown: 0 } as Record<PaymentMethod | "unknown", number>,
  );
}

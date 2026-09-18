export interface PaymentLike {
  orderId: string;
  at: string;
  amount: number;
  estimated?: boolean;
}

export function paymentInRange(payment: PaymentLike, from: Date, to: Date) {
  const time = new Date(payment.at).getTime();
  return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
}

export function paymentsInRange<T extends PaymentLike>(payments: T[], from: Date, to: Date): T[] {
  return payments.filter((payment) => paymentInRange(payment, from, to));
}

export function receivedInRange(payments: PaymentLike[], from: Date, to: Date) {
  return paymentsInRange(payments, from, to)
    .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
}

export function recordedForOrder(payments: PaymentLike[], orderId: string) {
  return payments
    .filter((payment) => payment.orderId === orderId)
    .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
}

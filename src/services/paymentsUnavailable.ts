// The backend has reservations and pending purchases, but NO payment step:
// no gateway, no payment record, no finance verification. So with a live
// backend the purchase stops honestly at "pending payment" — it is never
// shown as paid, and no plot is ever shown as allocated.

export class PaymentsUnavailableError extends Error {
  constructor() {
    super("Payments aren't available yet: the backend has no payment step. Your purchase is recorded as pending payment, and the plot stays held for you while it is.");
    this.name = "PaymentsUnavailableError";
  }
}

# Apppoint Craft

Booking and payments platform connecting shops (salons/service businesses), their staff, and customers. Shops manage a calendar of appointments; customers book online with an optional Mollie deposit.

## Language

**Booking**:
A scheduled appointment between a customer and a shop for a service, created either through the public booking flow (online) or manually by the shop owner from the calendar.
_Avoid_: Appointment (fine as UI copy, but "Booking" is the canonical term)

**Manual booking**:
A booking created directly by the shop owner (phone/walk-in/in-person arrangement) rather than through the public booking flow. Never requires online payment, regardless of the service's configured deposit.

**Confirmation**:
The transition of a booking from `pending` to `confirmed`. Triggered either by a successful Mollie deposit payment (online bookings) or by the shop owner's explicit action (manual bookings, and online bookings with no payment gate to wait on). Always sends the customer a confirmation email, regardless of which path triggered it.

**Cancellation**:
A shop-owner-initiated, non-reversible transition of a booking to `cancelled`. Only available before the booking's start time. Requires a free-text reason and always notifies the customer by email. Cancelling a booking does not touch an already-captured deposit — see Refund.
_Avoid_: Delete, soft-delete (the app never hard-deletes a booking; Cancellation is the only removal action)

**Refund**:
A shop-owner-initiated return of a captured payment via Mollie. Independent of a booking's cancellation status — a booking need not be cancelled to be refunded, and Cancellation never triggers one automatically.

**No-show**:
A shop-owner-recorded status marking that the customer did not attend. Settable only once the booking's start time has passed. Reversible back to `confirmed`.

**Completed**:
A status marking that the appointment took place. Settable only once the booking's end time has passed, from either `confirmed` or `no_show`. Reversible back to `confirmed`.

**Reschedule**:
A change to a booking's `starts_at`. Only available before the booking's start time, and always notifies the customer by email. A duration-only change (resize) or a staff-only reassignment at the same time is not a Reschedule and does not notify the customer.

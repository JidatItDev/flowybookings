# Public booking page — what’s new (client)

This note summarizes customer-facing changes on the public booking link (`/book/…`).

## Empty states

- **No services**  
  If the shop has no active services, customers see a clear empty message instead of a blank list. They cannot continue.

- **No team members**  
  If the shop has no active team members for the chosen service, customers see an empty message (not a fake “Any available” option). They cannot continue.

## Choosing a team member

- Customers can still pick a specific person or **Any available**.
- **Any available** means: book the first person who is working and free at that time.

## Date & time

- Times are only shown when they fit **both**:
  - the shop’s opening hours, and  
  - the selected person’s working hours (or at least one person, if “Any available”),  
  - excluding breaks.
- All times mean **the shop’s local timezone** (default Europe/Amsterdam), not the customer’s phone timezone.
- Days with no possible overlap (shop closed, or nobody working) are greyed out on the calendar.
- If a day has no bookable times, customers see: **“No available times on this day.”**
- Busy times (already booked) stay visible but disabled.

## Booking link first step

- On a shop-specific booking link, **Back** is disabled on the service step so customers are not sent away from the shop flow by mistake.

## What shops need configured

For customers to see real times, the shop should have:

1. Active services  
2. Active team members  
3. Shop opening hours  
4. Working hours set per team member  

If hours are missing on older shops, that day/person is treated as not bookable. **New shops** get default opening hours on create, and pick **timezone + business category** during onboarding (timezone prefills from the owner’s device).

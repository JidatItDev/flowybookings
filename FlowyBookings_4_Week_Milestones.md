# FlowyBookings — 4-Week Delivery Milestones

**Project:** FlowyBookings Platform Completion  
**Duration:** 4 weeks (20 business days)  
**Prepared:** August 2026

---

## Week 1 — Foundation & Security

### Goal
Stabilize the core platform, fix data security issues, establish email delivery, and ensure the public booking link works correctly.

### Work Items
- Fix tenant data isolation (ensure one business cannot see another business's customers, bookings, or payments)
- Repair the public booking link generation (currently broken)
- Add email verification step at signup
- Configure email delivery end-to-end and verify it works
- Test and fix existing owner workflows: shop creation, onboarding, services, staff management, customer management

### End of Week Deliverable
A shop owner can:
- Register, verify email, and create a shop
- Complete onboarding cleanly
- Add services, staff, and customers
- Share a public booking link that actually works
- Receive a real email in their inbox

**Test:** Create two separate shops and confirm neither owner can access the other's data. Share a booking link and open it successfully.

---

## Week 2 — Owner Revenue & Payment Foundation

### Goal
Enable shop owners to connect their payment account, subscribe to a plan, and ensure they cannot bypass payment to unlock premium features.

### Work Items
- Implement Mollie Connect (shop owner links their payout account)
- Complete subscription system: Starter, Pro, Premium plans
- Support monthly and yearly billing
- Enable plan upgrades, downgrades, and cancellations
- Fix the billing page
- Close the security hole that allows free Premium access
- Server-enforce plan limits (max bookings, max staff, features per plan)
- Send subscription emails (payment received, plan changed, etc.)

### End of Week Deliverable
A shop owner can:
- Connect their Mollie account for payouts
- Subscribe to a plan and see correct recurring billing
- Upgrade or downgrade their plan
- Cancel a subscription
- Confirm they **cannot** grant themselves Premium without paying

**Test:** Subscribe to Starter, upgrade to Pro, cancel subscription. Verify billing page shows correct status. Attempt to bypass payment via direct API call and confirm it's blocked.

---

## Week 3 — Customer Booking & Payment

### Goal
Enable real customers to book appointments with verified deposit payments, ensuring no booking confirms without payment.

### Work Items
- Prevent bookings from confirming without a verified Mollie deposit
- Fix the fallback paths that currently confirm unpaid bookings
- Add database-level double-booking protection
- Fix timezone inconsistency between customer and shop
- Move confirmation email to fire only after payment is verified
- Add clear error page for invalid booking links

### End of Week Deliverable
A customer can:
- Open a public booking link
- Select a service, staff, date, and time
- Pay a deposit via Mollie
- Receive a confirmation email only after payment succeeds
- Verify that abandoned or failed payments do **not** create confirmed bookings

**Test:** Complete a full booking with payment. Abandon a payment midway and confirm no booking is created. Try to double-book the same time slot and confirm it's blocked.

---

## Week 4 — Admin Panel, Invitations, PWA & Final Hardening

### Goal
Complete the admin panel, build staff invitation acceptance, deliver the mobile app (PWA), and ensure the platform is production-ready.

### Work Items
- Complete and verify admin panel features (roles, activity log, last login, settings, impersonation audit)
- Build the staff invitation accept flow (currently missing)
- Hide non-functional Support Tickets section
- Package the platform as an installable Progressive Web App (PWA)
- Responsive design verification (desktop, tablet, mobile)
- Validation and error handling sweep
- Full end-to-end testing under normal and failure conditions
- Final production verification

### End of Week Deliverable
An admin can:
- Access the admin panel and view shops, users, activity logs
- Invite a staff member who can accept and gain access
- Install the platform as a mobile app (PWA)
- Run the entire customer and owner journey on mobile without issues

**Test:** Install FlowyBookings on a mobile device. Invite a staff member via email, accept the invitation, and confirm access. Run a full booking on mobile. Test edge cases: failed payment, expired link, incorrect data entry.

---

## Out of Scope

The following are **not included** in this 4-week plan and remain future enhancements:
- Native iOS application
- Native Android application  
- WhatsApp reminders
- SMS notifications (provider integration incomplete)
- Support Tickets (mock data only, hidden for launch)

---

## Success Criteria

At the end of Week 4, the platform will provide:
- Secure, isolated data for each business
- Reliable public booking with verified payments
- Working subscription plans with recurring billing
- All transactional emails delivering correctly
- Full admin panel functionality
- An installable mobile experience (PWA)
- A fully tested, production-ready application

---

## Notes

- **Email setup (Week 1):** Requires `LOVABLE_API_KEY` and pg_cron configuration to drain the email queue.
- **Mollie prerequisite (Week 2):** Customer payments (Week 3) depend on the shop's Mollie account being connected.
- **Staff invitations (Week 4):** No accept route currently exists — this is new build work, not just a fix.
- **Decision needed:** Should public booking be disabled until a shop connects Mollie, or should no-deposit bookings be allowed as a valid mode?

---

**End of Document**

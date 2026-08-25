# Mollie Connect — how it works

This explains how connecting your own Mollie account to FlowyBookings works, in plain terms. This is **separate** from your FlowyBookings subscription (Starter/Pro/Premium) — that's a different payment, covered in `docs/billing/CLIENT.md`. This page is about *your customers'* booking deposit payments.

## What it's for

If you charge a deposit when customers book, connecting Mollie lets that money go **straight into your own Mollie account** — never into FlowyBookings' account. FlowyBookings automatically takes a small fixed fee per successful booking (the amount depends on your plan, and is always shown on your Payments page) — you never get billed separately for it.

## Connecting your account

1. Go to **Payments** in your dashboard and click **Connect**.
2. You're taken to Mollie's own secure login page. Log in with **your** Mollie account — you must be the account's owner (Mollie doesn't allow team members with just dashboard access to authorize apps like this).
3. Mollie shows you exactly what FlowyBookings is asking permission for, and asks you to approve it.
4. You're brought back to FlowyBookings, where you'll see a final confirmation screen showing the business name Mollie gave us — check it's really your business, then confirm.

Your FlowyBookings login and your Mollie login are never connected to each other — logging into Mollie during this process doesn't give FlowyBookings your Mollie password or any access beyond what you approved on that screen.

## Receiving payments

Once connected, deposit payments from your customers are processed through your own Mollie account. Funds settle to you on Mollie's normal payout schedule — FlowyBookings never holds or touches that money.

## Disconnecting

You can disconnect at any time from the same Payments page. This stops FlowyBookings from being able to create new payments or refunds through your account. It doesn't automatically revoke the connection on Mollie's side — if you want to remove FlowyBookings' access entirely, do that from your own Mollie dashboard too.

You can reconnect at any time using the same Connect button.

## Security

- Your access to Mollie is never stored as a password — FlowyBookings only keeps an encrypted authorization token, and only backend systems (never your browser, never another shop) can use it.
- All payments and refunds through your connection go through Mollie's own systems — FlowyBookings never sees or stores your card or bank details.

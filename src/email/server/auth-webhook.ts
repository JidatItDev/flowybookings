// Auth emails are sent by Supabase Auth + Resend SMTP.
// This Lovable hook is a no-op so leftover platform calls do not enqueue PGMQ mail.

export const handlers = {
  POST: async () => {
    return Response.json({ skipped: true, reason: 'auth_via_supabase_smtp' })
  },
}

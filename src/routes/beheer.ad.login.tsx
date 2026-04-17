import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/beheer/ad/login")({
  head: () => ({ meta: [{ title: "Platform login" }] }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { session, loading, isSuperAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    if (isSuperAdmin) {
      navigate({ to: "/beheer/dashboard" });
    } else {
      navigate({ to: "/" });
    }
  }, [session, loading, isSuperAdmin, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
          <h1 className="text-lg font-semibold tracking-tight">Platform access</h1>
          <p className="mt-1 text-sm text-muted-foreground">Authorized personnel only.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

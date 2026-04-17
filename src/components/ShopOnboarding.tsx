import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function ShopOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const createShop = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const finalSlug = slug || slugify(name);
      // Insert shop owned by current user
      const { data: shop, error } = await supabase
        .from("shops")
        .insert({
          name,
          slug: finalSlug,
          owner_id: user.id,
          status: "active",
          plan: "trial",
        })
        .select("id")
        .single();
      if (error) throw error;
      // Add shop_owner role row
      await supabase.from("user_roles").insert({
        user_id: user.id,
        role: "shop_owner",
        shop_id: shop.id,
      });
      return shop.id;
    },
    onSuccess: () => {
      toast.success("Shop created — welcome aboard!");
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      qc.invalidateQueries({ queryKey: ["auth", "roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createShop.mutate();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand">
            <Sparkle className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Bookly</span>
        </div>
        <div className="rounded-3xl border border-border bg-card p-8 shadow-elevated">
          <h1 className="text-2xl font-semibold tracking-tight">Create your shop</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Let's set up your workspace. You can change everything later.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Shop name</Label>
              <Input
                id="name"
                placeholder="e.g. Inkwell Studio"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">URL slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">bookly.app/</span>
                <Input
                  id="slug"
                  placeholder="inkwell-studio"
                  required
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers and dashes.
              </p>
            </div>
            <Button
              type="submit"
              variant="hero"
              className="w-full"
              disabled={createShop.isPending}
            >
              {createShop.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create shop
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Calendar, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/book/confirmation")({
  head: () => ({
    meta: [
      { title: "Booking confirmed — Bookly" },
      { name: "description", content: "Your appointment is confirmed. We've sent the details to your inbox." },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-gradient-hero px-4 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-elevated sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mint">
          <CheckCircle2 className="h-8 w-8 text-mint-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          You're booked in!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A confirmation has been sent to your email. We've also scheduled a 24h and 2h reminder.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-left text-sm">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">Sleeve Tattoo Session</p>
              <p className="text-xs text-muted-foreground">Tomorrow · 10:00 — 12:00</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <MapPin className="h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">Inkwell Studio</p>
              <p className="text-xs text-muted-foreground">Berlin, DE</p>
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="hero">
            <Link to="/book">
              Book another <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

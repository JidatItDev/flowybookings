import { useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const langs: Locale[] = ["nl", "en"];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useT();
  return (
    <div className={cn("inline-flex items-center rounded-full border border-border bg-card p-0.5", className)}>
      {langs.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition-colors",
            locale === l
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Delay in ms before this element animates in (use for stagger). */
  delay?: number;
}

/**
 * Lightweight scroll-reveal wrapper — fail-safe.
 *
 * Important: children are ALWAYS rendered. Visibility starts `true` so that
 * during SSR / before hydration / if IntersectionObserver fails, content is
 * fully visible. After mount we briefly hide and then reveal with a fade +
 * slide-up when the element scrolls into view.
 *
 * Honors prefers-reduced-motion (CSS in src/styles.css disables transitions).
 */
export function Reveal({
  delay = 0,
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  // Default visible so SSR + no-JS users always see content.
  const [visible, setVisible] = React.useState(true);
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    // Skip animation entirely if IO is unavailable — keep visible.
    if (typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;

    // Arm: hide, then observe and reveal on intersection.
    setArmed(true);
    setVisible(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);

    // Safety net: if for any reason the observer never fires within 1.2s,
    // force the element visible. Prevents permanent invisibility.
    const fallback = window.setTimeout(() => setVisible(true), 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(armed && "reveal", visible && "reveal-in", className)}
      style={armed ? { transitionDelay: `${delay}ms`, ...style } : style}
      {...rest}
    >
      {children}
    </div>
  );
}

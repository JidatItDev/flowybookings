import * as React from "react";
import { cn } from "@/lib/utils";

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Delay in ms before this element animates in (use for stagger). */
  delay?: number;
  /** Render as inline-block instead of block. */
  as?: "div" | "span" | "li";
}

/**
 * Lightweight scroll-reveal wrapper.
 * - Fades in + slides up subtly when the element enters the viewport.
 * - Uses IntersectionObserver (no library, no layout shift).
 * - Honors prefers-reduced-motion (becomes a no-op via CSS).
 * - Reuses the .reveal utility defined in src/styles.css.
 */
export function Reveal({
  delay = 0,
  as = "div",
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as as "div";
  return (
    <Tag
      ref={ref}
      className={cn("reveal", visible && "reveal-in", className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

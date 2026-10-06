import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/* ---------- Card ---------- */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[#e4eaf3] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-[17px] font-bold leading-7 text-[#16233a]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/* ---------- Button ---------- */
type ButtonVariant = "green" | "blue";

const buttonStyles: Record<ButtonVariant, string> = {
  green:
    "bg-[#1e8e3e] hover:bg-[#166c2e] focus-visible:ring-[#1e8e3e]/40 active:bg-[#145c27]",
  blue:
    "bg-[#2474c6] hover:bg-[#1a5da3] focus-visible:ring-[#2474c6]/40 active:bg-[#174e85]",
};

export function UIButton({
  variant = "green",
  className,
  children,
  href,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  href?: string;
}) {
  const cls = cn(
    "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md px-4 text-[15px] font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
    buttonStyles[variant],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button {...props} className={cls}>
      {children}
    </button>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ปิดหน้าต่าง"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-[#16233a]">{title}</h3>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-[#5b6b82] hover:bg-[#f1f5fa]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Avatar (CSS-only, no image asset) ---------- */
export function Avatar({
  initials,
  color,
  size = "md",
}: {
  initials: string;
  color: string;
  size?: "md" | "sm";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-bold",
        color,
        size === "md" ? "h-10 w-10 text-[15px]" : "h-8 w-8 text-[13px]",
      )}
    >
      {initials}
    </span>
  );
}

/* ---------- Progress bar (CSS-only) ---------- */
export function ProgressBar({
  value,
  max,
  tone = "green",
}: {
  value: number;
  max: number;
  tone?: "green" | "orange" | "gray";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar =
    tone === "green"
      ? "bg-[#1e9e4b]"
      : tone === "orange"
        ? "bg-[#f0a020]"
        : "bg-[#c9d2de]";
  return (
    <div
      className="h-[5px] w-full overflow-hidden rounded-full bg-[#e6ebf2]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

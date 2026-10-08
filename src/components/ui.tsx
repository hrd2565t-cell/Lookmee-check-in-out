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

/* ---------- DonutChart (pure SVG, ใช้ร่วมกันทุกหน้า) ---------- */
export function DonutChart({
  pct,
  size = 48,
  track = "#e6ebf2",
  bar = "#1e8e3e",
  thickness = 5,
  children,
}: {
  pct: number;
  size?: number;
  track?: string;
  bar?: string;
  thickness?: number;
  children?: ReactNode;
}) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped)} เปอร์เซ็นต์`}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={bar}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="relative flex flex-col items-center leading-none">{children}</span>
    </span>
  );
}

/* ---------- ScoreCell (ช่องกรอกคะแนนในตาราง, ใช้ร่วมกันได้) ---------- */
export function ScoreCell({
  value,
  max,
  dirty,
  disabled,
  onChange,
  label,
}: {
  value: string;
  max: number;
  dirty?: boolean;
  disabled?: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      aria-label={label}
      value={value}
      disabled={disabled}
      inputMode="decimal"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      placeholder="-"
      title={`เต็ม ${max}`}
      className={
        dirty
          ? "h-9 w-14 rounded-md border border-[#e0a800] bg-[#fff8e1] text-center text-[14px] font-semibold text-[#16233a] focus:border-[#e0a800] focus:outline-none"
          : "h-9 w-14 rounded-md border border-[#e4eaf3] bg-white text-center text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
      }
    />
  );
}

/* ---------- FilePreviewModal (ดูรูป/PDF ในจอเดียว ไม่เปลี่ยนหน้า) ---------- */
export function FilePreviewModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const isPdf =
    url.split("?")[0]?.toLowerCase().endsWith(".pdf") ?? false;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ปิดหน้าต่าง"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-2.5">
          <p className="truncate text-[14.5px] font-bold text-[#16233a]">{title}</p>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-[#5b6b82] hover:bg-[#f1f5fa]"
          >
            ×
          </button>
        </div>
        <div className="slim-scroll max-h-[75vh] overflow-auto bg-[#3a4148] p-3">
          {isPdf ? (
            <iframe
              src={url}
              title={title}
              className="h-[70vh] w-full rounded-md bg-white"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={title} className="mx-auto max-h-[70vh] rounded-md" />
          )}
        </div>
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
  tone?: "green" | "orange" | "gray" | "blue" | "purple";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar =
    tone === "green"
      ? "bg-[#1e9e4b]"
      : tone === "orange"
        ? "bg-[#f0a020]"
        : tone === "blue"
          ? "bg-[#2474c6]"
          : tone === "purple"
            ? "bg-[#7b1fa2]"
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

type IconProps = {
  className?: string;
};

function Base({
  className = "h-5 w-5",
  children,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </Base>
  );
}

export function ScanIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M7 12h10" />
    </Base>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.5 14.6c2.4.3 4.2 1.9 4.9 4.4" />
    </Base>
  );
}

export function ReportIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M6 2.5h8L19 8v13.5H6z" />
      <path d="M14 2.5V8h5" />
      <path d="M9 12.5h6M9 16h6M9 19h4" />
    </Base>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </Base>
  );
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c1-3.8 3.9-5.8 7.5-5.8s6.5 2 7.5 5.8" />
    </Base>
  );
}

export function ManageIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="8.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M3.5 19c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />
      <path d="m15.5 15.5 2 2 3.5-4" />
    </Base>
  );
}

export function AttendanceIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 3.5V2m8 1.5V2M4 9.5h16" />
      <path d="m9.5 14.5 1.8 1.8 3.4-3.8" />
    </Base>
  );
}

export function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function EyeIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function EyeOffIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 4l16 16" />
      <path d="M10.6 6c.5-.1.9-.1 1.4-.1 6.5 0 9.5 6.1 9.5 6.1a17.6 17.6 0 0 1-3.2 3.7" />
      <path d="M6.6 6.9C4 8.7 2.5 12 2.5 12s3 6.5 9.5 6.5c1.4 0 2.7-.3 3.8-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Base>
  );
}

export function ClockIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function GearIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
    </Base>
  );
}

export function PencilIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m13.5 6.5 3 3" />
    </Base>
  );
}

export function TrashIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Base>
  );
}

export function CheckCircleIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Base>
  );
}

export function AlertCircleIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V13" />
      <path d="M12 16.2v.3" />
    </Base>
  );
}

export function DownloadIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="M12 3.5V15" />
      <path d="m7 10.5 5 5 5-5" />
      <path d="M4 19.5h16" />
    </Base>
  );
}

export function CalendarIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <rect x="4" y="5" width="16" height="15.5" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Base>
  );
}

export function PageFirstIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="m17 6-6 6 6 6" />
      <path d="M7 6v12" />
    </Base>
  );
}

export function PagePrevIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </Base>
  );
}

export function PageNextIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </Base>
  );
}

export function PageLastIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <Base className={className}>
      <path d="m7 6 6 6-6 6" />
      <path d="M17 6v12" />
    </Base>
  );
}

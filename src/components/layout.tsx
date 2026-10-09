import Link from "next/link";
import {
  CalendarIcon,
  ChevronDownIcon,
  GearIcon,
  HomeIcon,
  PencilIcon,
  ReportIcon,
  ScanIcon,
  UsersIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { BrandMark, FullLogo } from "@/components/logo";
import { NotificationsButton } from "@/components/notifications";
import { UserMenu } from "@/components/user-menu";

export type NavKey = "dashboard" | "scanner" | "students" | "grading" | "reports" | "timetable" | "settings";

const NAV_ITEMS: Array<{
  key: NavKey;
  thai: string;
  eng: string;
  href: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}> = [
  { key: "dashboard", thai: "หน้าแรก", eng: "", href: "/", icon: HomeIcon },
  {
    key: "scanner",
    thai: "เช็กชื่อเข้าเรียน",
    eng: "(Attendance)",
    href: "/scanner",
    icon: ScanIcon,
  },
  {
    key: "students",
    thai: "นักเรียนและกลุ่มเรียน",
    eng: "(Student Management)",
    href: "/students",
    icon: UsersIcon,
  },
  {
    key: "grading",
    thai: "งานและคะแนน",
    eng: "(Assignments & Scores)",
    href: "/grading",
    icon: PencilIcon,
  },
  {
    key: "reports",
    thai: "รายงานและคำขอ",
    eng: "(Attendance & Requests)",
    href: "/reports",
    icon: ReportIcon,
  },
  {
    key: "timetable",
    thai: "ตารางสอน",
    eng: "(Teaching Schedule)",
    href: "/timetable",
    icon: CalendarIcon,
  },
  {
    key: "settings",
    thai: "ตั้งค่าระบบ",
    eng: "(Settings)",
    href: "/settings",
    icon: GearIcon,
  },
];

function NavList({
  active,
  orientation = "vertical",
}: {
  active: NavKey;
  orientation?: "vertical" | "horizontal";
}) {
  const compactLink = (item: (typeof NAV_ITEMS)[number], label?: string) => {
    const isActive = item.key === active || (item.key === "scanner" && active === "reports");
    const Icon = item.icon;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={item.key === active ? "page" : isActive ? "location" : undefined}
        className={cn(
          "relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-center transition-colors",
          isActive ? "bg-[#e6f4ea] font-semibold text-[#166c2e]" : "text-[#5b6b82] hover:bg-[#f1f5fa]",
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", isActive ? "text-[#1e8e3e]" : "text-[#5b6b82]")} />
        <span className="truncate text-[10.5px] leading-tight">{label ?? item.thai}</span>
      </Link>
    );
  };

  if (orientation === "horizontal") {
    const moreActive = active === "timetable" || active === "settings";
    return (
      <nav aria-label="เมนูหลัก" className="grid grid-cols-5 gap-1">
        {compactLink(NAV_ITEMS[0]!, "หน้าแรก")}
        {compactLink(NAV_ITEMS[1]!, "เข้าเรียน")}
        {compactLink(NAV_ITEMS[2]!, "นักเรียน")}
        {compactLink(NAV_ITEMS[3]!, "งาน/คะแนน")}
        <details open={moreActive} className="group relative min-w-0">
          <summary
            aria-label="เมนูเพิ่มเติม"
            className={cn(
              "flex min-h-12 cursor-pointer list-none flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-center transition-colors [&::-webkit-details-marker]:hidden",
              moreActive ? "bg-[#e6f4ea] font-semibold text-[#166c2e]" : "text-[#5b6b82] hover:bg-[#f1f5fa]",
            )}
          >
            <ChevronDownIcon className={cn("h-[18px] w-[18px] transition-transform group-open:rotate-180", moreActive ? "text-[#1e8e3e]" : "text-[#5b6b82]")} />
            <span className="truncate text-[10.5px] leading-tight">เพิ่มเติม</span>
          </summary>
          <div className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-xl border border-[#e4eaf3] bg-white p-1.5 shadow-lg">
            {[NAV_ITEMS[5]!, NAV_ITEMS[6]!].map((item) => {
              const Icon = item.icon;
              const selected = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={selected ? "page" : undefined}
                  className={cn("flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold", selected ? "bg-[#e6f4ea] text-[#166c2e]" : "text-[#16233a] hover:bg-[#f1f5fa]")}
                >
                  <Icon className="h-4 w-4" />
                  {item.thai}
                </Link>
              );
            })}
          </div>
        </details>
      </nav>
    );
  }

  const verticalLink = (item: (typeof NAV_ITEMS)[number], label?: string) => {
    const isActive = item.key === active;
    const Icon = item.icon;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={item.key === active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-r-lg px-4 py-2.5 text-left transition-colors",
          isActive ? "bg-[#e6f4ea] font-semibold text-[#166c2e]" : "text-[#16233a] hover:bg-[#f1f5fa]",
        )}
      >
        <span aria-hidden="true" className={cn("absolute bottom-1 left-0 top-1 w-1 rounded-r-full bg-[#1e9e4b]", isActive ? "opacity-100" : "opacity-0")} />
        <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-[#1e8e3e]" : "text-[#5b6b82]")} />
        <span className="leading-tight">
          <span className="block text-[15px]">{label ?? item.thai}</span>
          {item.eng ? <span className={cn("block text-[12.5px] font-normal", isActive ? "text-[#166c2e]/80" : "text-[#5b6b82]")}>{item.eng}</span> : null}
        </span>
      </Link>
    );
  };

  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col">
      {verticalLink(NAV_ITEMS[0]!)}
      <div className="mt-2 border-t border-[#eef2f7] pt-2">
        <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#8a97ab]">การเข้าเรียน</p>
        {verticalLink(NAV_ITEMS[1]!, "เช็กชื่อ")}
        {verticalLink(NAV_ITEMS[4]!, "รายงานและคำขอ")}
      </div>
      <div className="mt-2 border-t border-[#eef2f7] pt-2">
        <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#8a97ab]">จัดการข้อมูล</p>
        {verticalLink(NAV_ITEMS[2]!)}
        {verticalLink(NAV_ITEMS[3]!, "งานและคะแนน")}
      </div>
      <div className="mt-2 border-t border-[#eef2f7] pt-2">
        <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#8a97ab]">ตั้งค่าการสอน</p>
        {verticalLink(NAV_ITEMS[5]!)}
        {verticalLink(NAV_ITEMS[6]!)}
      </div>
    </nav>
  );
}

export function TopBar() {
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-[#e3e9f2] bg-white px-4 sm:gap-3 sm:px-6">
      <BrandMark size={40} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[16px] font-bold tracking-tight text-[#16233a] sm:text-[18px]">
          LOOKMEE <span className="font-semibold">Check In-Out</span>
        </p>
        <p className="hidden truncate text-[12px] text-[#5b6b82] sm:block">
          Student Attendance System (MVP)
        </p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <NotificationsButton />
        <UserMenu />
      </div>
    </header>
  );
}

export function AppShell({
  active = "dashboard",
  title,
  children,
}: {
  active?: NavKey;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#eaf1f8]">
      <TopBar />
      {/* mobile nav */}
      <div className="border-b border-[#e3e9f2] bg-white px-3 py-2 lg:hidden">
        <NavList active={active} orientation="horizontal" />
      </div>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 items-stretch gap-0 px-0 sm:px-4 lg:gap-5 lg:px-6 lg:py-5">
        {/* sidebar (desktop) */}
        <aside className="sticky top-5 hidden h-fit w-[228px] shrink-0 rounded-xl border border-[#e4eaf3] bg-white py-3 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] lg:block">
          <div className="px-3 pb-3">
            <FullLogo />
          </div>
          <NavList active={active} />
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-2 lg:px-1 lg:py-0">
          <h1 className="mb-4 text-[26px] font-bold leading-tight text-[#16233a] sm:text-[32px]">
            {title}
          </h1>
          {active === "scanner" || active === "reports" ? (
            <nav aria-label="เมนูการเข้าเรียน" className="mb-4 flex gap-2 rounded-xl border border-[#e4eaf3] bg-white p-1.5">
              {[
                { key: "scanner" as const, label: "เช็กชื่อ", href: "/scanner" },
                { key: "reports" as const, label: "รายงานและคำขอ", href: "/reports" },
              ].map((item) => {
                const selected = active === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={selected ? "page" : undefined}
                    className={cn("flex min-h-10 flex-1 items-center justify-center rounded-lg px-3 text-[13.5px] font-semibold transition-colors", selected ? "bg-[#e6f4ea] text-[#166c2e]" : "text-[#5b6b82] hover:bg-[#f1f5fa]")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

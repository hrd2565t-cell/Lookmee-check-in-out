import Link from "next/link";
import {
  CalendarIcon,
  HomeIcon,
  ReportIcon,
  ScanIcon,
  UsersIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { BrandMark, FullLogo } from "@/components/logo";
import { NotificationsButton } from "@/components/notifications";
import { UserMenu } from "@/components/user-menu";

export type NavKey = "dashboard" | "scanner" | "students" | "reports" | "timetable";

const NAV_ITEMS: Array<{
  key: NavKey;
  thai: string;
  eng: string;
  href: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}> = [
  { key: "dashboard", thai: "Dashboard", eng: "", href: "/", icon: HomeIcon },
  {
    key: "scanner",
    thai: "สแกนเข้าเรียน",
    eng: "(Daily Scanner)",
    href: "/scanner",
    icon: ScanIcon,
  },
  {
    key: "students",
    thai: "จัดการนักเรียน",
    eng: "(Student Management)",
    href: "/students",
    icon: UsersIcon,
  },
  {
    key: "reports",
    thai: "รายงานการเข้าเรียน",
    eng: "(Reports)",
    href: "/reports",
    icon: ReportIcon,
  },
  {
    key: "timetable",
    thai: "ตารางคาบเรียน",
    eng: "(Timetable)",
    href: "/timetable",
    icon: CalendarIcon,
  },
];

function NavList({
  active,
  orientation = "vertical",
}: {
  active: NavKey;
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className={cn(
        orientation === "vertical"
          ? "flex flex-col"
          : "flex flex-row gap-2 overflow-x-auto",
      )}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active;
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-r-lg px-4 py-2.5 text-left transition-colors",
              orientation === "horizontal" && "min-w-max rounded-lg",
              isActive
                ? "bg-[#e6f4ea] font-semibold text-[#166c2e]"
                : "text-[#16233a] hover:bg-[#f1f5fa]",
            )}
          >
            {/* active left rail */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-[#1e9e4b]",
                isActive ? "opacity-100" : "opacity-0",
                orientation === "horizontal" && "hidden",
              )}
            />
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                isActive ? "text-[#1e8e3e]" : "text-[#5b6b82]",
              )}
            />
            <span className="leading-tight">
              <span className="block text-[15px]">{item.thai}</span>
              {item.eng ? (
                <span
                  className={cn(
                    "block text-[12.5px] font-normal",
                    isActive ? "text-[#166c2e]/80" : "text-[#5b6b82]",
                  )}
                >
                  {item.eng}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
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
          {children}
        </main>
      </div>
    </div>
  );
}

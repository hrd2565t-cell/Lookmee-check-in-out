"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/logo";
import { clearStudentCode } from "@/lib/student";

export function StudentShell({
  name,
  group,
  active,
  children,
}: {
  name: string;
  group: string;
  active: "history" | "scan";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const logout = () => {
    clearStudentCode();
    router.push("/login");
    router.refresh();
  };
  return (
    <div className="flex min-h-screen flex-col bg-[#eaf1f8]">
      <header className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-[#e3e9f2] bg-white px-4">
        <BrandMark size={36} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-bold text-[#16233a]">{name}</p>
          <p className="text-[12px] text-[#5b6b82]">{group}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="ml-auto rounded-md border border-[#d8e0ec] px-2.5 py-1 text-[12.5px] font-semibold text-[#5b6b82] hover:bg-[#f1f5fa]"
        >
          ออกจากระบบ
        </button>
      </header>
      <nav aria-label="เมนูนักเรียน" className="flex gap-2 border-b border-[#e3e9f2] bg-white px-4 py-2">
        <Link
          href="/student"
          className={
            active === "history"
              ? "h-10 flex-1 rounded-lg bg-[#16233a] text-center text-[14px] font-bold leading-10 text-white sm:flex-none sm:px-6"
              : "h-10 flex-1 rounded-lg border border-[#d8e0ec] bg-white text-center text-[14px] font-semibold leading-10 text-[#5b6b82] sm:flex-none sm:px-6"
          }
        >
          ประวัติของฉัน
        </Link>
        <Link
          href="/student/scan"
          className={
            active === "scan"
              ? "h-10 flex-1 rounded-lg bg-[#16233a] text-center text-[14px] font-bold leading-10 text-white sm:flex-none sm:px-6"
              : "h-10 flex-1 rounded-lg border border-[#d8e0ec] bg-white text-center text-[14px] font-semibold leading-10 text-[#5b6b82] sm:flex-none sm:px-6"
          }
        >
          สแกนใบหน้า
        </Link>
      </nav>
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-4">{children}</main>
    </div>
  );
}

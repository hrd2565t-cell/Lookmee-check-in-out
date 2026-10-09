"use client";

import { useCallback, useEffect, useState } from "react";

const GROUP_KEY = "lookmee-teacher-selected-group";
const GROUP_EVENT = "lookmee:teacher-group-change";

export function readTeacherGroup() {
  try {
    return typeof window === "undefined" ? "" : window.localStorage.getItem(GROUP_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Shared last-selected class context across the teacher's pages. */
export function useTeacherGroup(groups: readonly string[]) {
  const [storedGroup, setStoredGroup] = useState("");

  useEffect(() => {
    const sync = () => setStoredGroup(readTeacherGroup());
    sync();
    window.addEventListener(GROUP_EVENT, sync);
    return () => window.removeEventListener(GROUP_EVENT, sync);
  }, []);

  const setSelectedGroup = useCallback((group: string) => {
    if (group) window.localStorage.setItem(GROUP_KEY, group);
    else window.localStorage.removeItem(GROUP_KEY);
    setStoredGroup(group);
    window.dispatchEvent(new Event(GROUP_EVENT));
  }, []);

  return {
    selectedGroup: groups.includes(storedGroup) ? storedGroup : "",
    setSelectedGroup,
  };
}

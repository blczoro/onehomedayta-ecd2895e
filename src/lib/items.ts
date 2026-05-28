import { differenceInCalendarDays, parseISO } from "date-fns";

export const CATEGORIES = [
  "Electronics",
  "Furniture",
  "Insurance",
  "Appliance",
  "Vehicle",
  "Subscription",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const REMINDER_OPTIONS = [
  { value: 1, label: "1 day before" },
  { value: 7, label: "7 days before" },
  { value: 30, label: "30 days before" },
];

export function daysUntil(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), new Date());
}

export type Status = "expired" | "soon" | "active";

export function statusOf(dateStr: string, reminderDays: number): Status {
  const d = daysUntil(dateStr);
  if (d < 0) return "expired";
  if (d <= reminderDays) return "soon";
  return "active";
}

export const statusStyles: Record<Status, string> = {
  expired: "bg-destructive/10 text-destructive border-destructive/20",
  soon: "bg-warning/15 text-warning-foreground border-warning/30",
  active: "bg-success/10 text-success border-success/20",
};

export const statusLabel: Record<Status, string> = {
  expired: "Expired",
  soon: "Expiring soon",
  active: "Active",
};

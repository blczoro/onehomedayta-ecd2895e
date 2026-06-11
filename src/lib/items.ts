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

// ---------- Category-specific detail fields ----------

export type DetailFieldType = "text" | "date" | "number" | "boolean" | "textarea" | "file";

export interface DetailField {
  key: string;
  label: string;
  type: DetailFieldType;
}

export interface DetailSection {
  title: string;
  fields: DetailField[];
}

export const DETAIL_SECTIONS: Record<string, DetailSection[]> = {
  Electronics: [
    {
      title: "Product",
      fields: [
        { key: "brand", label: "Brand name", type: "text" },
        { key: "model", label: "Model number", type: "text" },
        { key: "serial", label: "Serial number", type: "text" },
      ],
    },
    {
      title: "Warranty",
      fields: [
        { key: "purchase_date", label: "Purchase date", type: "date" },
        { key: "warranty_start", label: "Warranty start date", type: "date" },
        { key: "warranty_end", label: "Warranty expiry date", type: "date" },
        { key: "seller", label: "Seller / store name", type: "text" },
      ],
    },
  ],
  Furniture: [
    {
      title: "Item",
      fields: [
        { key: "material", label: "Material type", type: "text" },
        { key: "brand", label: "Brand / store", type: "text" },
        { key: "purchase_date", label: "Purchase date", type: "date" },
      ],
    },
    {
      title: "Warranty",
      fields: [
        { key: "warranty_details", label: "Warranty details", type: "textarea" },
      ],
    },
  ],
  Insurance: [
    {
      title: "Policy",
      fields: [
        { key: "policy_number", label: "Policy number", type: "text" },
        { key: "company", label: "Insurance company", type: "text" },
        { key: "premium", label: "Premium amount", type: "number" },
        { key: "renewal_date", label: "Renewal date", type: "date" },
      ],
    },
  ],
  Vehicle: [
    {
      title: "Vehicle",
      fields: [
        { key: "registration", label: "Registration number", type: "text" },
        { key: "insurance_expiry", label: "Insurance expiry", type: "date" },
        { key: "puc_expiry", label: "PUC expiry", type: "date" },
        { key: "service_date", label: "Service reminder date", type: "date" },
      ],
    },
  ],
  Subscription: [
    {
      title: "Plan",
      fields: [
        { key: "plan", label: "Monthly / yearly plan", type: "text" },
        { key: "renewal_date", label: "Renewal date", type: "date" },
        { key: "amount", label: "Payment amount", type: "number" },
        { key: "auto_renew", label: "Auto-renew enabled", type: "boolean" },
      ],
    },
  ],
  Appliance: [
    {
      title: "Appliance",
      fields: [
        { key: "brand", label: "Brand", type: "text" },
        { key: "model", label: "Model", type: "text" },
        { key: "purchase_date", label: "Purchase date", type: "date" },
        { key: "warranty_end", label: "Warranty expiry date", type: "date" },
        { key: "seller", label: "Seller / store", type: "text" },
      ],
    },
  ],
  Other: [],
};

export function detailsCompleteness(
  category: string,
  details: Record<string, unknown> | null | undefined,
): { filled: number; total: number; percent: number } {
  const sections = DETAIL_SECTIONS[category] ?? DETAIL_SECTIONS.Other;
  const fields = sections.flatMap((s) => s.fields);
  const total = fields.length;
  const d = details ?? {};
  const filled = fields.filter((f) => {
    const v = (d as Record<string, unknown>)[f.key];
    if (f.type === "boolean") return v === true || v === false;
    return v !== undefined && v !== null && String(v).trim() !== "";
  }).length;
  return { filled, total, percent: total === 0 ? 100 : Math.round((filled / total) * 100) };
}

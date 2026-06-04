import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import {
  Bell,
  Plus,
  Check,
  Clock,
  Repeat,
  Trash2,
  CalendarIcon,
  Search,
  RotateCcw,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VisibilityBadge } from "@/components/visibility-badge";
import { VisibilityToggle } from "@/components/visibility-toggle";
import { ShareDialog } from "@/components/share-dialog";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({ meta: [{ title: "Reminders — Warranty Reminder" }] }),
  component: RemindersPage,
});

const REMINDER_TYPES = [
  "Warranty",
  "Insurance",
  "Service",
  "Subscription",
  "Payment",
  "Personal",
  "Other",
] as const;

const RECURRENCE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "every_3_months", label: "Every 3 Months" },
  { value: "every_6_months", label: "Every 6 Months" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom (days)" },
];

const NOTIFY_OPTIONS = [
  { value: 0, label: "On the day" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "7 days before" },
  { value: 14, label: "14 days before" },
  { value: 30, label: "30 days before" },
];

type FilterKey = "week" | "month" | "6months" | "year" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "6months", label: "6 Months" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Reminders" },
];

type Reminder = {
  id: string;
  user_id: string;
  item_id: string | null;
  title: string;
  reminder_type: string;
  reminder_date: string;
  notes: string | null;
  notify_days_before: number;
  recurrence: string;
  recurrence_custom_days: number | null;
  ends_type: string;
  ends_after_count: number | null;
  ends_on_date: string | null;
  status: string;
  snoozed_until: string | null;
  completed_at: string | null;
  visibility?: string;
};

type Completion = {
  id: string;
  user_id: string;
  source_type: "reminder" | "item";
  source_id: string;
  title: string;
  reminder_type: string;
  original_date: string;
  recurrence: string;
  completed_at: string;
};

type VisualState = "completed" | "overdue" | "today" | "snoozed" | "upcoming";

function effectiveDate(r: Reminder) {
  return r.snoozed_until ?? r.reminder_date;
}

function visualState(r: Reminder): VisualState {
  if (r.status === "completed") return "completed";
  const d = differenceInCalendarDays(parseISO(effectiveDate(r)), startOfDay(new Date()));
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (r.snoozed_until) return "snoozed";
  return "upcoming";
}

function statusColor(r: Reminder): "green" | "yellow" | "red" {
  const s = visualState(r);
  if (s === "completed") return "green";
  if (s === "overdue") return "red";
  const d = differenceInCalendarDays(parseISO(effectiveDate(r)), startOfDay(new Date()));
  if (d <= r.notify_days_before) return "yellow";
  return "green";
}

const colorClasses: Record<"green" | "yellow" | "red", string> = {
  green: "border-l-4 border-l-success",
  yellow: "border-l-4 border-l-warning",
  red: "border-l-4 border-l-destructive",
};

const stateBadge: Record<VisualState, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-success/15 text-success border-success/30" },
  overdue: { label: "Overdue", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  today: { label: "Due Today", cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  snoozed: { label: "Snoozed", cls: "bg-muted text-muted-foreground border-border" },
  upcoming: { label: "Upcoming", cls: "bg-primary/10 text-primary border-primary/20" },
};

function recurrenceLabel(r: Reminder) {
  if (r.recurrence === "none") return "One-time";
  const opt = RECURRENCE_OPTIONS.find((o) => o.value === r.recurrence);
  if (r.recurrence === "custom" && r.recurrence_custom_days)
    return `Every ${r.recurrence_custom_days} days`;
  return opt?.label ?? "Recurring";
}

function withinFilter(dateStr: string, key: FilterKey): boolean {
  const today = startOfDay(new Date());
  const date = parseISO(dateStr);
  switch (key) {
    case "week":
      return (date >= today && date <= endOfWeek(addDays(today, 0), { weekStartsOn: 1 })) ||
        (date >= today && date <= addDays(today, 7));
    case "month":
      return date >= today && date <= endOfMonth(today);
    case "6months":
      return date >= today && date <= addMonths(today, 6);
    case "year":
      return date >= today && date <= endOfYear(today);
    case "all":
      return true;
  }
}

function advanceDate(r: Reminder): Date | null {
  const base = parseISO(r.reminder_date);
  let next: Date;
  switch (r.recurrence) {
    case "daily": next = addDays(base, 1); break;
    case "weekly": next = addWeeks(base, 1); break;
    case "monthly": next = addMonths(base, 1); break;
    case "every_3_months": next = addMonths(base, 3); break;
    case "every_6_months": next = addMonths(base, 6); break;
    case "yearly": next = addYears(base, 1); break;
    case "custom": next = addDays(base, r.recurrence_custom_days ?? 1); break;
    default: return null;
  }
  if (r.ends_type === "on_date" && r.ends_on_date) {
    if (next > parseISO(r.ends_on_date)) return null;
  }
  if (r.ends_type === "after" && (r.ends_after_count ?? 0) <= 1) return null;
  return next;
}

function RemindersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("week");
  const [modalOpen, setModalOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Reminder | null>(null);
  const [completedSearch, setCompletedSearch] = useState("");
  const [completedTypeFilter, setCompletedTypeFilter] = useState<string>("all");
  const [shareFor, setShareFor] = useState<Reminder | null>(null);

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .order("reminder_date", { ascending: true });
      if (error) throw error;
      return data as Reminder[];
    },
    enabled: !!user,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,name,category,expiry_date,reminder_days,notes")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: completions = [] } = useQuery({
    queryKey: ["reminder_completions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminder_completions")
        .select("*")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data as Completion[];
    },
    enabled: !!user,
  });

  // Set of "source_type:source_id:date" already completed (used to hide item reminders that were completed)
  const completedKeys = useMemo(() => {
    const s = new Set<string>();
    completions.forEach((c) => s.add(`${c.source_type}:${c.source_id}:${c.original_date}`));
    return s;
  }, [completions]);

  const itemReminders: Reminder[] = useMemo(
    () =>
      items
        .map((it) => ({
          id: `item:${it.id}`,
          user_id: "__item__",
          item_id: it.id,
          title: it.name,
          reminder_type: it.category,
          reminder_date: it.expiry_date,
          notes: it.notes,
          notify_days_before: it.reminder_days ?? 7,
          recurrence: "none",
          recurrence_custom_days: null,
          ends_type: "never",
          ends_after_count: null,
          ends_on_date: null,
          status: "active",
          snoozed_until: null,
          completed_at: null,
          visibility: (it as { visibility?: string }).visibility ?? "personal",
        }))
        // hide item reminders that already have a completion for that date
        .filter((r) => !completedKeys.has(`item:${r.item_id}:${r.reminder_date}`)),
    [items, completedKeys],
  );

  const allReminders = useMemo(
    () => [...reminders, ...itemReminders],
    [reminders, itemReminders],
  );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["reminders"] });
    qc.invalidateQueries({ queryKey: ["reminder_completions"] });
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Reminder> }) => {
      const { error } = await supabase.from("reminders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const today = startOfDay(new Date());

  const active = allReminders.filter((r) => r.status !== "completed");

  const overdue = active.filter(
    (r) => differenceInCalendarDays(parseISO(effectiveDate(r)), today) < 0,
  );
  const upcoming = active.filter((r) => {
    const d = differenceInCalendarDays(parseISO(effectiveDate(r)), today);
    return d >= 0 && withinFilter(effectiveDate(r), filter);
  });

  const upcomingCount = active.filter(
    (r) => differenceInCalendarDays(parseISO(effectiveDate(r)), today) >= 0,
  ).length;

  async function recordCompletion(r: Reminder) {
    if (!user) return;
    const isItem = r.user_id === "__item__";
    await supabase.from("reminder_completions").insert({
      user_id: user.id,
      source_type: isItem ? "item" : "reminder",
      source_id: isItem ? (r.item_id as string) : r.id,
      title: r.title,
      reminder_type: r.reminder_type,
      original_date: r.reminder_date,
      recurrence: r.recurrence,
    });
  }

  async function handleComplete(r: Reminder) {
    await recordCompletion(r);

    if (r.user_id === "__item__") {
      // item-based: just record completion; the item reminder hides because completedKeys matches
      invalidateAll();
      toast.success("Reminder completed successfully.");
      return;
    }

    if (r.recurrence === "none") {
      updateMut.mutate({
        id: r.id,
        patch: { status: "completed", completed_at: new Date().toISOString() },
      });
      toast.success("Reminder completed successfully.");
      return;
    }

    const next = advanceDate(r);
    if (!next) {
      updateMut.mutate({
        id: r.id,
        patch: { status: "completed", completed_at: new Date().toISOString() },
      });
      toast.success("Recurring series completed.");
      return;
    }
    updateMut.mutate({
      id: r.id,
      patch: {
        reminder_date: format(next, "yyyy-MM-dd"),
        snoozed_until: null,
        ends_after_count:
          r.ends_type === "after" && r.ends_after_count
            ? r.ends_after_count - 1
            : r.ends_after_count,
      },
    });
    toast.success("Current occurrence completed. Next reminder scheduled automatically.");
  }

  function handleSnooze(r: Reminder, days: number) {
    if (r.user_id === "__item__") {
      toast.info("Snooze isn't available for item-based reminders. Edit the item to change its expiry date.");
      return;
    }
    const base = parseISO(effectiveDate(r));
    const snooze = addDays(base < today ? today : base, days);
    updateMut.mutate({
      id: r.id,
      patch: { snoozed_until: format(snooze, "yyyy-MM-dd") },
    });
    toast.success(`Snoozed ${days} day${days === 1 ? "" : "s"}`);
  }

  async function handleRestore(c: Completion) {
    if (!user) return;
    await supabase.from("reminder_completions").delete().eq("id", c.id);
    if (c.source_type === "reminder") {
      // reactivate the reminder row (best-effort; row may have moved on for recurring)
      await supabase
        .from("reminders")
        .update({ status: "active", completed_at: null })
        .eq("id", c.source_id);
    }
    invalidateAll();
    toast.success("Reminder restored");
  }

  // Filtered completed list
  const filteredCompletions = useMemo(() => {
    const q = completedSearch.trim().toLowerCase();
    return completions.filter((c) => {
      if (completedTypeFilter !== "all" && c.reminder_type !== completedTypeFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.reminder_type.toLowerCase().includes(q)
      );
    });
  }, [completions, completedSearch, completedTypeFilter]);

  const completionTypes = useMemo(
    () => Array.from(new Set(completions.map((c) => c.reminder_type))).sort(),
    [completions],
  );

  // History list for the modal
  const historyList = useMemo(() => {
    if (!historyFor) return [];
    const isItem = historyFor.user_id === "__item__";
    const sourceId = isItem ? historyFor.item_id : historyFor.id;
    return completions.filter(
      (c) => c.source_id === sourceId && c.source_type === (isItem ? "item" : "reminder"),
    );
  }, [historyFor, completions]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3 pb-3">
          <div>
            <h1 className="text-lg font-semibold">Reminders</h1>
            <p className="text-xs text-muted-foreground">
              {upcomingCount} upcoming · {overdue.length} overdue · {completions.length} completed
            </p>
          </div>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto bg-muted/60 p-1">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="text-xs">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {overdue.length > 0 && (
        <Section title="Overdue" count={overdue.length}>
          {overdue.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onDelete={(id) => deleteMut.mutate(id)}
              onHistory={() => setHistoryFor(r)}
              onShare={() => setShareFor(r)}
            />
          ))}
        </Section>
      )}

      <Section title="Upcoming" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nothing in this window.
          </p>
        ) : (
          upcoming.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onDelete={(id) => deleteMut.mutate(id)}
              onHistory={() => setHistoryFor(r)}
              onShare={() => setShareFor(r)}
            />
          ))
        )}
      </Section>

      <CompletedSection
        completions={filteredCompletions}
        totalCount={completions.length}
        search={completedSearch}
        onSearch={setCompletedSearch}
        typeFilter={completedTypeFilter}
        onTypeFilter={setCompletedTypeFilter}
        types={completionTypes}
        onRestore={handleRestore}
      />

      <Button
        size="icon"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        aria-label="Create reminder"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <CreateReminderDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        userId={user?.id}
        onCreated={() => qc.invalidateQueries({ queryKey: ["reminders"] })}
      />

      <HistoryDialog
        reminder={historyFor}
        completions={historyList}
        onClose={() => setHistoryFor(null)}
      />

      {shareFor && shareFor.user_id !== "__item__" && (
        <ShareDialog
          open={!!shareFor}
          onOpenChange={(v) => !v && setShareFor(null)}
          resourceType="reminder"
          resourceId={shareFor.id}
        />
      )}
      {shareFor && shareFor.user_id === "__item__" && shareFor.item_id && (
        <ShareDialog
          open={!!shareFor}
          onOpenChange={(v) => !v && setShareFor(null)}
          resourceType="item"
          resourceId={shareFor.item_id}
        />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {count}
        </span>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function ReminderCard({
  reminder,
  onComplete,
  onSnooze,
  onDelete,
  onHistory,
  onShare,
}: {
  reminder: Reminder;
  onComplete: (r: Reminder) => void;
  onSnooze: (r: Reminder, days: number) => void;
  onDelete: (id: string) => void;
  onHistory: () => void;
  onShare: () => void;
}) {
  const today = startOfDay(new Date());
  const eff = parseISO(effectiveDate(reminder));
  const days = differenceInCalendarDays(eff, today);
  const color = statusColor(reminder);
  const state = visualState(reminder);
  const isRecurring = reminder.recurrence !== "none";
  const isItem = reminder.user_id === "__item__";
  const [bursting, setBursting] = useState(false);

  const dayLabel =
    reminder.status === "completed"
      ? "Done"
      : days < 0
      ? `${Math.abs(days)}d overdue`
      : days === 0
      ? "Today"
      : `${days}d left`;

  function triggerComplete() {
    setBursting(true);
    setTimeout(() => setBursting(false), 600);
    onComplete(reminder);
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 transition-all",
        colorClasses[color],
        bursting && "scale-[0.99] bg-success/5",
      )}
    >
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{reminder.title}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {reminder.reminder_type} · {format(eff, "MMM d, yyyy")}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              color === "red" && "text-destructive",
              color === "yellow" && "text-warning",
              color === "green" && "text-success",
            )}
          >
            {dayLabel}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("text-[10px]", stateBadge[state].cls)}>
            {stateBadge[state].label}
          </Badge>
          <Badge variant="secondary" className="gap-1 text-[10px]">
            {isRecurring ? <Repeat className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {recurrenceLabel(reminder)}
          </Badge>
          {isItem && (
            <Badge variant="outline" className="text-[10px]">
              From Items
            </Badge>
          )}
          <VisibilityBadge visibility={reminder.visibility} />
          {reminder.notes && (
            <span className="truncate text-xs text-muted-foreground">· {reminder.notes}</span>
          )}
        </div>
        {reminder.status !== "completed" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "h-7 text-xs transition-transform",
                bursting && "scale-110 bg-success text-success-foreground border-success",
              )}
              onClick={triggerComplete}
            >
              <Check className="h-3 w-3" />
              {isRecurring ? "Complete · next" : "Complete"}
            </Button>
            {!isItem && (
              <>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSnooze(reminder, 1)}>
                  Snooze 1d
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSnooze(reminder, 7)}>
                  Snooze 1w
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onHistory}>
              <History className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onShare} title="Manage sharing">
              <Users className="h-3 w-3" />
            </Button>
            {!isItem && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(reminder.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CompletedSection({
  completions,
  totalCount,
  search,
  onSearch,
  typeFilter,
  onTypeFilter,
  types,
  onRestore,
}: {
  completions: Completion[];
  totalCount: number;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string;
  onTypeFilter: (v: string) => void;
  types: string[];
  onRestore: (c: Completion) => void;
}) {
  if (totalCount === 0) return null;
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Completed Reminders</h2>
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
          {totalCount}
        </span>
      </div>
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search completed…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={typeFilter} onValueChange={onTypeFilter}>
          <SelectTrigger className="h-9 w-full sm:w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="divide-y">
        {completions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          completions.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-4">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.reminder_type} · original {format(parseISO(c.original_date), "MMM d, yyyy")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Completed {format(parseISO(c.completed_at), "MMM d, yyyy")}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onRestore(c)}
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HistoryDialog({
  reminder,
  completions,
  onClose,
}: {
  reminder: Reminder | null;
  completions: Completion[];
  onClose: () => void;
}) {
  return (
    <Dialog open={!!reminder} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Completion history</DialogTitle>
        </DialogHeader>
        {reminder && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium">{reminder.title}</div>
              <div className="text-xs text-muted-foreground">
                {reminder.reminder_type} · {recurrenceLabel(reminder)}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              Completed <span className="font-medium">{completions.length}</span> time
              {completions.length === 1 ? "" : "s"}
            </div>
            {completions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completions yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {completions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b py-1.5 last:border-b-0">
                    <span>{format(parseISO(c.completed_at), "MMM d, yyyy")}</span>
                    <span className="text-xs text-muted-foreground">
                      for {format(parseISO(c.original_date), "MMM d, yyyy")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateReminderDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | undefined;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Other");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notify, setNotify] = useState(1);
  const [recurrence, setRecurrence] = useState("none");
  const [customDays, setCustomDays] = useState(30);
  const [endsType, setEndsType] = useState("never");
  const [endsAfter, setEndsAfter] = useState(5);
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<"personal" | "shared">("personal");
  const [saving, setSaving] = useState(false);

  const recurrencePreview = useMemo(() => {
    if (recurrence === "none") return null;
    const fake: Reminder = {
      id: "",
      user_id: "",
      item_id: null,
      title: "",
      reminder_type: type,
      reminder_date: date,
      notes: null,
      notify_days_before: notify,
      recurrence,
      recurrence_custom_days: customDays,
      ends_type: endsType,
      ends_after_count: endsAfter,
      ends_on_date: endsOn || null,
      status: "active",
      snoozed_until: null,
      completed_at: null,
    };
    const dates: Date[] = [parseISO(date)];
    let cur = { ...fake };
    for (let i = 0; i < 3; i++) {
      const n = advanceDate(cur);
      if (!n) break;
      dates.push(n);
      cur = { ...cur, reminder_date: format(n, "yyyy-MM-dd") };
    }
    return dates;
  }, [recurrence, date, customDays, endsType, endsAfter, endsOn, type, notify]);

  function reset() {
    setTitle("");
    setType("Other");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setNotify(1);
    setRecurrence("none");
    setCustomDays(30);
    setEndsType("never");
    setEndsAfter(5);
    setEndsOn("");
    setNotes("");
    setVisibility("personal");
  }

  async function save() {
    if (!userId || !title.trim() || !date) {
      toast.error("Title and date are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("reminders").insert({
      user_id: userId,
      title: title.trim(),
      reminder_type: type,
      reminder_date: date,
      notify_days_before: notify,
      recurrence,
      recurrence_custom_days: recurrence === "custom" ? customDays : null,
      ends_type: recurrence === "none" ? "never" : endsType,
      ends_after_count: endsType === "after" ? endsAfter : null,
      ends_on_date: endsType === "on_date" && endsOn ? endsOn : null,
      notes: notes.trim() || null,
      visibility,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reminder created");
    reset();
    onOpenChange(false);
    onCreated();
  }

  const notifyDate = useMemo(() => {
    try {
      return format(addDays(parseISO(date), -notify), "MMM d, yyyy");
    } catch {
      return "";
    }
  }, [date, notify]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="r-title">Title *</Label>
            <Input
              id="r-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bike service"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="r-date">Date *</Label>
              <Input
                id="r-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Notify</Label>
              <Select value={String(notify)} onValueChange={(v) => setNotify(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTIFY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {recurrence === "custom" && (
            <div>
              <Label>Every N days</Label>
              <Input
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}

          {recurrence !== "none" && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label>Ends</Label>
              <Select value={endsType} onValueChange={setEndsType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never ends</SelectItem>
                  <SelectItem value="after">End after X times</SelectItem>
                  <SelectItem value="on_date">End on specific date</SelectItem>
                </SelectContent>
              </Select>
              {endsType === "after" && (
                <Input
                  type="number"
                  min={1}
                  value={endsAfter}
                  onChange={(e) => setEndsAfter(Math.max(1, Number(e.target.value) || 1))}
                />
              )}
              {endsType === "on_date" && (
                <Input
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              )}
              {recurrencePreview && recurrencePreview.length > 0 && (
                <div className="pt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 font-medium">
                    <CalendarIcon className="h-3 w-3" /> Next occurrences
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {recurrencePreview.map((d, i) => (
                      <li key={i}>· {format(d, "MMM d, yyyy")}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="r-notes">Notes</Label>
            <Textarea
              id="r-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>

          <div>
            <Label>Visibility</Label>
            <div className="mt-1">
              <VisibilityToggle value={visibility} onChange={setVisibility} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {visibility === "personal"
                ? "Only you can see this reminder."
                : "You can invite people after saving."}
            </p>
          </div>

          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Notification: <span className="font-medium text-foreground">{notifyDate}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

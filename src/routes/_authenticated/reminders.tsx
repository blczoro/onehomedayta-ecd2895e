import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { daysUntil } from "@/lib/items";
import { format, parseISO } from "date-fns";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({ meta: [{ title: "Reminders — Warranty Reminder" }] }),
  component: RemindersPage,
});

function Section({ title, items, count }: { title: string; items: any[]; count: number }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const d = daysUntil(item.expiry_date);
            return (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.category} • {format(parseISO(item.expiry_date), "MMM d, yyyy")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? "Today" : `${d}d left`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RemindersPage() {
  const { user } = useAuth();
  const { data: items = [] } = useQuery({
    queryKey: ["items", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("expiry_date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const today = items.filter((i) => {
    const d = daysUntil(i.expiry_date);
    return d >= 0 && d <= i.reminder_days && d <= 1;
  });
  const upcoming = items.filter((i) => {
    const d = daysUntil(i.expiry_date);
    return d > 1 && d <= i.reminder_days;
  });
  const expired = items.filter((i) => daysUntil(i.expiry_date) < 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Section title="Today" items={today} count={today.length} />
      <Section title="Upcoming" items={upcoming} count={upcoming.length} />
      <Section title="Expired" items={expired} count={expired.length} />
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpaces } from "@/hooks/use-spaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { daysUntil, statusOf, statusStyles, statusLabel } from "@/lib/items";
import { Search, Plus, Package, Clock, AlertCircle } from "lucide-react";
import { useState } from "react";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Warranty Reminder" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { currentSpace } = useSpaces();
  const spaceId = currentSpace?.id;
  const [q, setQ] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", spaceId],
    queryFn: async () => {
      if (!spaceId) return [];
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("space_id", spaceId)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!spaceId,
  });

  const total = items.length;
  const expired = items.filter((i) => daysUntil(i.expiry_date) < 0).length;
  const upcoming = items.filter((i) => {
    const d = daysUntil(i.expiry_date);
    return d >= 0 && d <= 30;
  }).length;

  const filtered = items.filter((i) =>
    q ? i.name.toLowerCase().includes(q.toLowerCase()) || i.category.toLowerCase().includes(q.toLowerCase()) : true,
  );

  const stats = [
    { label: "Total items", value: total, icon: Package },
    { label: "Upcoming (30 days)", value: upcoming, icon: Clock },
    { label: "Expired", value: expired, icon: AlertCircle },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Button asChild>
          <Link to="/add-item"><Plus className="mr-1 h-4 w-4" /> Add Item</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-3xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-medium">Recent items</h2>
          <Link to="/my-items" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">No items yet.</p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/add-item">Add your first item</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.slice(0, 8).map((item) => {
              const status = statusOf(item.expiry_date, item.reminder_days);
              const d = daysUntil(item.expiry_date);
              return (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/items/$id/edit"
                        params={{ id: item.id }}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      {!item.details_complete && (
                        <span className="rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning-foreground">
                          Missing details
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.category} • {format(parseISO(item.expiry_date), "MMM d, yyyy")}
                    </div>
                  </div>
                  <span className={`hidden text-xs sm:inline text-muted-foreground`}>
                    {d < 0 ? `${Math.abs(d)}d ago` : `${d}d left`}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${statusStyles[status]}`}>
                    {statusLabel[status]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

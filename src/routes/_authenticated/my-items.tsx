import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, daysUntil, statusOf, statusStyles, statusLabel } from "@/lib/items";
import { format, parseISO } from "date-fns";
import { Pencil, Trash2, Plus, Search, AlertCircle, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { VisibilityBadge } from "@/components/visibility-badge";
import { ExportMenu } from "@/components/export-menu";

export const Route = createFileRoute("/_authenticated/my-items")({
  head: () => ({ meta: [{ title: "My Applications — One Home" }] }),
  component: MyItemsPage,
});

function MyItemsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [editExpiry, setEditExpiry] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("expiry_date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: docCounts = {} } = useQuery({
    queryKey: ["document-counts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("item_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.item_id] = (counts[row.item_id] ?? 0) + 1;
      return counts;
    },
    enabled: !!user,
  });

  const filtered = items.filter((i) => {
    const m = q ? i.name.toLowerCase().includes(q.toLowerCase()) : true;
    const c = cat === "all" ? true : i.category === cat;
    return m && c;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this application?")) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editExpiry) return;
    const { error } = await supabase.from("items").update({ expiry_date: editExpiry }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Applications</h1>
        <p className="text-sm text-muted-foreground">Everything you're tracking in one place.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <ExportMenu />
        <Button asChild>
          <Link to="/add-item"><Plus className="mr-1 h-4 w-4" /> Add</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No applications found.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => {
            const status = statusOf(item.expiry_date, item.reminder_days);
            const d = daysUntil(item.expiry_date);
            const dCount = docCounts[item.id] ?? 0;
            return (
              <div key={item.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{item.name}</h3>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusStyles[status]}`}>
                      {statusLabel[status]}
                    </span>
                    <VisibilityBadge visibility={item.visibility} />
                    {dCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        <Paperclip className="h-3 w-3" /> {dCount}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Expiry: <span className="text-foreground">{format(parseISO(item.expiry_date), "MMM d, yyyy")}</span>
                  {" • "}
                  {d < 0 ? `${Math.abs(d)} days ago` : `${d} days left`}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Reminder: {item.reminder_days} day(s) before</div>

                {!item.details_complete && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 text-warning-foreground shrink-0" />
                    <span className="text-warning-foreground">Missing details — add more for better reminders.</span>
                  </div>
                )}

                {editing === item.id ? (
                  <div className="mt-3 flex gap-2">
                    <Input type="date" value={editExpiry} onChange={(e) => setEditExpiry(e.target.value)} />
                    <Button size="sm" onClick={() => handleSaveEdit(item.id)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant={item.details_complete ? "outline" : "default"}>
                      <Link to="/items/$id/edit" params={{ id: item.id }}>
                        <Pencil className="mr-1 h-3 w-3" />
                        {item.details_complete ? "Open" : "Complete Details"}
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditing(item.id); setEditExpiry(item.expiry_date); }}
                    >
                      Quick date
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

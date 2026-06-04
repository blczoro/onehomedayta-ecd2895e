import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpaces } from "@/hooks/use-spaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/items";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/add-item")({
  head: () => ({ meta: [{ title: "Add Item — Warranty Reminder" }] }),
  component: AddItemPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().min(1, "Pick a category"),
  expiry_date: z.string().min(1, "Expiry date is required"),
});

function AddItemPage() {
  const { user } = useAuth();
  const { currentSpace, canEdit } = useSpaces();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["space_members_with_profiles", currentSpace?.id],
    queryFn: async () => {
      if (!currentSpace) return [];
      const { data: m } = await supabase
        .from("space_members")
        .select("user_id, role")
        .eq("space_id", currentSpace.id);
      const ids = (m ?? []).map((x) => x.user_id);
      if (ids.length === 0) return [];
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      const map = new Map((p ?? []).map((x) => [x.id, x]));
      return (m ?? []).map((x) => ({
        user_id: x.user_id,
        display_name: map.get(x.user_id)?.display_name ?? null,
        email: map.get(x.user_id)?.email ?? null,
      }));
    },
    enabled: !!currentSpace,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, category, expiry_date: expiryDate });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user || !currentSpace) return;
    if (!canEdit) return toast.error("You don't have permission to add items in this space.");

    setSubmitting(true);
    const { data, error } = await supabase
      .from("items")
      .insert({
        user_id: user.id,
        space_id: currentSpace.id,
        assigned_to: assignedTo === "none" ? null : assignedTo,
        name: parsed.data.name,
        category: parsed.data.category,
        expiry_date: parsed.data.expiry_date,
        reminder_days: 7,
        details: {},
        details_complete: false,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !data) return toast.error(error?.message ?? "Failed to save");
    qc.invalidateQueries({ queryKey: ["items"] });
    setSavedId(data.id);
  };

  if (savedId) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border bg-card p-6 text-center animate-in fade-in slide-in-from-bottom-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold">Item saved successfully.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add more details now or later.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate({ to: "/items/$id/edit", params: { id: savedId } })}>
              Add Details
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/my-items" })}>
              Skip For Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Add an item</h1>
          {currentSpace && (
            <Link to="/spaces/$id" params={{ id: currentSpace.id }} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
              {currentSpace.icon} {currentSpace.name}
            </Link>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Save it in seconds. Add more details later.
          {!canEdit && " You're a viewer in this space — switch to one you can edit."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Item name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. iPhone 15"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiry">Expiry / warranty date</Label>
            <Input
              id="expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
            />
          </div>

          {currentSpace?.is_shared && members.length > 1 && (
            <div className="space-y-2">
              <Label>Assign to (optional)</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name ?? m.email ?? "Member"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" disabled={submitting || !canEdit} className="w-full">
            {submitting ? "Saving…" : "Save Item"}
          </Button>
        </form>
      </div>
    </div>
  );
}

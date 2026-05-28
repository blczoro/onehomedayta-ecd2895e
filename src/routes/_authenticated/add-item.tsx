import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, REMINDER_OPTIONS } from "@/lib/items";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/add-item")({
  head: () => ({ meta: [{ title: "Add Item — Warranty Reminder" }] }),
  component: AddItemPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().min(1, "Pick a category"),
  purchase_date: z.string().optional(),
  expiry_date: z.string().min(1, "Expiry date is required"),
  reminder_days: z.number().int().min(0).max(365),
  notes: z.string().max(2000).optional(),
});

const empty = {
  name: "",
  category: "",
  purchase_date: "",
  expiry_date: "",
  reminder_days: "7",
  notes: "",
  customReminder: "",
};

function AddItemPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCustom = f.reminder_days === "custom";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const reminder_days = isCustom ? Number(f.customReminder || 0) : Number(f.reminder_days);
    const parsed = schema.safeParse({
      name: f.name,
      category: f.category,
      purchase_date: f.purchase_date || undefined,
      expiry_date: f.expiry_date,
      reminder_days,
      notes: f.notes || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return;

    setSubmitting(true);
    const { error } = await supabase.from("items").insert({
      user_id: user.id,
      name: parsed.data.name,
      category: parsed.data.category,
      purchase_date: parsed.data.purchase_date || null,
      expiry_date: parsed.data.expiry_date,
      reminder_days: parsed.data.reminder_days,
      notes: parsed.data.notes || null,
      document_url: file ? file.name : null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Item saved");
    qc.invalidateQueries({ queryKey: ["items"] });
    navigate({ to: "/my-items" });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-lg font-semibold">Add an item</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track a warranty, renewal, or expiry.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Item name</Label>
            <Input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reminder</Label>
              <Select value={f.reminder_days} onValueChange={(v) => setF({ ...f, reminder_days: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {isCustom && (
                <Input
                  type="number"
                  min={0}
                  max={365}
                  placeholder="Days before"
                  value={f.customReminder}
                  onChange={(e) => setF({ ...f, customReminder: e.target.value })}
                />
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="purchase">Purchase date</Label>
              <Input id="purchase" type="date" value={f.purchase_date} onChange={(e) => setF({ ...f, purchase_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry">Warranty / expiry date</Label>
              <Input id="expiry" type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Upload bill / document</Label>
            <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save item"}</Button>
            <Button type="button" variant="outline" onClick={() => { setF(empty); setFile(null); }}>
              Clear
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/items";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { VisibilityToggle } from "@/components/visibility-toggle";

export const Route = createFileRoute("/_authenticated/add-item")({
  head: () => ({ meta: [{ title: "Add Application — One Home" }] }),
  component: AddItemPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().min(1, "Pick a category"),
  expiry_date: z.string().min(1, "Expiry date is required"),
});

function AddItemPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [visibility, setVisibility] = useState<"personal" | "shared">("personal");
  const [submitting, setSubmitting] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, category, expiry_date: expiryDate });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return;

    setSubmitting(true);
    const { data, error } = await supabase
      .from("items")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        category: parsed.data.category,
        expiry_date: parsed.data.expiry_date,
        reminder_days: 7,
        details: {},
        details_complete: false,
        visibility,
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
          <h2 className="mt-4 text-base font-semibold">Application saved successfully.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibility === "shared"
              ? "Add details and invite people to share this application."
              : "Add more details now or later."}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate({ to: "/items/$id/edit", params: { id: savedId } })}>
              {visibility === "shared" ? "Manage & Share" : "Add Details"}
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
        <h1 className="text-lg font-semibold">Add an application</h1>
        <p className="mt-1 text-sm text-muted-foreground">Save it in seconds. Add more details later.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Application name</Label>
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

          <div className="space-y-2">
            <Label>Visibility</Label>
            <div>
              <VisibilityToggle value={visibility} onChange={setVisibility} />
            </div>
            <p className="text-xs text-muted-foreground">
              {visibility === "personal"
                ? "Only you can see this application."
                : "You'll be able to invite people after saving."}
            </p>
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Save Application"}
          </Button>
        </form>
      </div>
    </div>
  );
}

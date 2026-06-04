import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpaces } from "@/hooks/use-spaces";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Lock } from "lucide-react";
import { toast } from "sonner";

const ICONS = ["🏠", "🏢", "🏪", "🏡", "🚗", "👨‍👩‍👧", "💼", "🏖️", "🎓", "🛒"];

export const Route = createFileRoute("/_authenticated/spaces")({
  head: () => ({ meta: [{ title: "Spaces — Warranty Reminder" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ create: s.create ? 1 : undefined }),
  component: SpacesPage,
});

function SpacesPage() {
  const { spaces, refresh, setCurrentSpaceId } = useSpaces();
  const search = Route.useSearch();
  const [open, setOpen] = useState(Boolean(search.create));

  const counts = useQuery({
    queryKey: ["space_counts"],
    queryFn: async () => {
      const ids = spaces.map((s) => s.id);
      if (ids.length === 0) return {} as Record<string, { items: number; members: number }>;
      const [{ data: items }, { data: members }] = await Promise.all([
        supabase.from("items").select("space_id").in("space_id", ids),
        supabase.from("space_members").select("space_id").in("space_id", ids),
      ]);
      const out: Record<string, { items: number; members: number }> = {};
      ids.forEach((id) => (out[id] = { items: 0, members: 0 }));
      (items ?? []).forEach((r) => out[r.space_id].items++);
      (members ?? []).forEach((r) => out[r.space_id].members++);
      return out;
    },
    enabled: spaces.length > 0,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Spaces</h1>
          <p className="text-sm text-muted-foreground">Organize items & reminders, share with others.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Space
        </Button>
      </div>

      {spaces.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No spaces yet.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Create your first space
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {spaces.map((s) => {
            const c = counts.data?.[s.id];
            return (
              <Link
                key={s.id}
                to="/spaces/$id"
                params={{ id: s.id }}
                onClick={() => setCurrentSpaceId(s.id)}
                className="rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{s.icon}</span>
                    <div>
                      <h3 className="font-medium">{s.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {s.description ?? (s.is_shared ? "Shared space" : "Private space")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {s.role}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  {s.is_shared ? (
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c?.members ?? 0} members</span>
                  ) : (
                    <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Private</span>
                  )}
                  <span>· {c?.items ?? 0} items</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <CreateSpaceDialog open={open} onOpenChange={setOpen} onCreated={refresh} />
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
});

function CreateSpaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const { user } = useAuth();
  const { setCurrentSpaceId } = useSpaces();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏠");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = schema.safeParse({ name, description: description || undefined });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("spaces")
      .insert({
        owner_id: user.id,
        name: parsed.data.name,
        icon,
        description: parsed.data.description ?? null,
        is_shared: isShared,
      })
      .select("*")
      .single();
    if (error || !data) {
      setSaving(false);
      return toast.error(error?.message ?? "Failed");
    }
    const { error: mErr } = await supabase
      .from("space_members")
      .insert({ space_id: data.id, user_id: user.id, role: "owner" });
    setSaving(false);
    if (mErr) return toast.error(mErr.message);
    toast.success("Space created");
    await onCreated();
    setCurrentSpaceId(data.id);
    qc.invalidateQueries({ queryKey: ["space_counts"] });
    onOpenChange(false);
    setName("");
    setDescription("");
    setIsShared(false);
    setIcon("🏠");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Space</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home" autoFocus />
          </div>
          <div>
            <Label>Icon</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`flex h-10 w-10 items-center justify-center rounded-md border text-xl transition ${
                    icon === i ? "border-primary bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
            <div>
              <div className="text-sm font-medium">Shared space</div>
              <p className="text-xs text-muted-foreground">Invite others to collaborate.</p>
            </div>
            <Switch checked={isShared} onCheckedChange={setIsShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

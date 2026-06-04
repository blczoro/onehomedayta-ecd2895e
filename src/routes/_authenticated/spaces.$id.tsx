import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpaces } from "@/hooks/use-spaces";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Copy, Link as LinkIcon, Plus, Trash2, UserPlus, Activity, Users, LayoutDashboard, Settings } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { daysUntil } from "@/lib/items";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/spaces/$id")({
  head: () => ({ meta: [{ title: "Space — Warranty Reminder" }] }),
  component: SpaceDetail,
});

type Member = {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  joined_at: string;
  display_name: string | null;
  email: string | null;
};

type Invite = {
  id: string;
  token: string;
  role_on_accept: string;
  email: string | null;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
};

type Activity = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
};

function initials(name: string | null | undefined, email: string | null | undefined) {
  const s = (name ?? email ?? "?").trim();
  const parts = s.split(/\s+|@/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function SpaceDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { spaces, currentSpace, setCurrentSpaceId, refresh: refreshSpaces } = useSpaces();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  // Ensure currentSpace tracks URL
  useEffect(() => {
    if (currentSpace?.id !== id && spaces.some((s) => s.id === id)) {
      setCurrentSpaceId(id);
    }
  }, [id, currentSpace, spaces, setCurrentSpaceId]);

  const space = spaces.find((s) => s.id === id) ?? null;
  const isOwner = space?.role === "owner";
  const canEdit = isOwner || space?.role === "editor";

  // Counts
  const { data: stats } = useQuery({
    queryKey: ["space_stats", id],
    queryFn: async () => {
      const [{ data: items }, { count: members }] = await Promise.all([
        supabase.from("items").select("expiry_date").eq("space_id", id),
        supabase.from("space_members").select("*", { count: "exact", head: true }).eq("space_id", id),
      ]);
      const { data: rem } = await supabase
        .from("reminders")
        .select("status")
        .eq("space_id", id);
      const totalItems = items?.length ?? 0;
      const expired = (items ?? []).filter((i) => daysUntil(i.expiry_date) < 0).length;
      const upcoming = (items ?? []).filter((i) => {
        const d = daysUntil(i.expiry_date);
        return d >= 0 && d <= 30;
      }).length;
      const active = (rem ?? []).filter((r) => r.status !== "completed").length;
      return { totalItems, expired, upcoming, active, members: members ?? 0 };
    },
  });

  // Members
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["space_members_full", id],
    queryFn: async () => {
      const { data: m } = await supabase
        .from("space_members")
        .select("id, user_id, role, joined_at")
        .eq("space_id", id)
        .order("joined_at");
      const ids = (m ?? []).map((x) => x.user_id);
      if (ids.length === 0) return [] as Member[];
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      const map = new Map((p ?? []).map((x) => [x.id, x]));
      return (m ?? []).map<Member>((x) => ({
        id: x.id,
        user_id: x.user_id,
        role: x.role as Member["role"],
        joined_at: x.joined_at,
        display_name: map.get(x.user_id)?.display_name ?? null,
        email: map.get(x.user_id)?.email ?? null,
      }));
    },
  });

  // Activity
  const { data: activity = [] } = useQuery({
    queryKey: ["space_activity", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("space_activity")
        .select("*")
        .eq("space_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      const actorIds = Array.from(new Set((data ?? []).map((d) => d.actor_id).filter(Boolean))) as string[];
      const { data: p } = actorIds.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", actorIds)
        : { data: [] };
      const nameMap = new Map((p ?? []).map((x) => [x.id, x.display_name ?? x.email ?? "Someone"]));
      return (data ?? []).map<Activity>((d) => ({
        id: d.id,
        actor_id: d.actor_id,
        action: d.action,
        entity_type: d.entity_type,
        entity_id: d.entity_id,
        metadata: (d.metadata as Record<string, unknown>) ?? {},
        created_at: d.created_at,
        actor_name: d.actor_id ? (nameMap.get(d.actor_id) ?? "Someone") : "Someone",
      }));
    },
  });

  // Invites
  const { data: invites = [], refetch: refetchInvites } = useQuery({
    queryKey: ["space_invites", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("space_invites")
        .select("*")
        .eq("space_id", id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Invite[];
    },
    enabled: isOwner || space?.role === "editor",
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`space-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "space_activity", filter: `space_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["space_activity", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "space_members", filter: `space_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["space_members_full", id] });
        qc.invalidateQueries({ queryKey: ["space_stats", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  if (!space) {
    return <div className="text-sm text-muted-foreground">Loading space…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-4xl">{space.icon}</span>
          <div>
            <h1 className="text-xl font-semibold">{space.name}</h1>
            <p className="text-sm text-muted-foreground">
              {space.is_shared ? "Shared space" : "Private space"} · You are {space.role}
            </p>
            {space.description && (
              <p className="mt-1 text-sm text-muted-foreground">{space.description}</p>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">Open dashboard</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap gap-1 h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Members</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Items" value={stats?.totalItems ?? 0} />
            <Stat label="Active reminders" value={stats?.active ?? 0} />
            <Stat label="Upcoming (30d)" value={stats?.upcoming ?? 0} />
            <Stat label="Expired" value={stats?.expired ?? 0} />
            <Stat label="Members" value={stats?.members ?? 0} />
          </div>
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">Recent activity</h2>
              <button onClick={() => setTab("activity")} className="text-xs text-primary hover:underline">View all</button>
            </div>
            <ActivityList items={activity.slice(0, 10)} />
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-4 space-y-4">
          {space.is_shared && (isOwner || space.role === "editor") && (
            <InviteCard spaceId={id} invites={invites} onChange={refetchInvites} isOwner={!!isOwner} />
          )}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">Members ({members.length})</h2>
            </div>
            <ul className="divide-y">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isOwner={!!isOwner}
                  isSelf={m.user_id === user?.id}
                  spaceId={id}
                  onChange={refetchMembers}
                />
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">Activity feed</h2>
            </div>
            <ActivityList items={activity} />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsPanel
            spaceId={id}
            isOwner={!!isOwner}
            initial={{
              name: space.name,
              icon: space.icon,
              description: space.description ?? "",
              is_shared: space.is_shared,
            }}
            onSaved={refreshSpaces}
            onDeleted={async () => {
              await refreshSpaces();
              navigate({ to: "/spaces" });
            }}
            currentUserId={user?.id ?? ""}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ActivityList({ items }: { items: Activity[] }) {
  if (items.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-4 py-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-[10px]">{initials(a.actor_name, null)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{a.actor_name ?? "Someone"}</span>{" "}
              <span className="text-muted-foreground">{actionLabel(a)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function actionLabel(a: Activity): string {
  const meta = a.metadata;
  const name = (meta.name as string) || (meta.title as string) || "an item";
  switch (a.action) {
    case "item.created": return `added "${name}"`;
    case "item.deleted": return `deleted "${name}"`;
    case "reminder.created": return `created reminder "${name}"`;
    case "reminder.completed": return `completed reminder "${name}"`;
    case "reminder.deleted": return `deleted reminder "${name}"`;
    case "member.joined": return `joined as ${meta.role ?? "member"}`;
    case "member.left": return `left the space`;
    default: return a.action;
  }
}

function InviteCard({
  spaceId,
  invites,
  onChange,
  isOwner,
}: {
  spaceId: string;
  invites: Invite[];
  onChange: () => void;
  isOwner: boolean;
}) {
  const { user } = useAuth();
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!user) return;
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    setCreating(true);
    const { error } = await supabase.from("space_invites").insert({
      space_id: spaceId,
      token,
      role_on_accept: role,
      email: email.trim() || null,
      created_by: user.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    setEmail("");
    onChange();
    toast.success("Invite link created");
  }

  const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4" />
        <h3 className="text-sm font-medium">Invite members</h3>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <Input placeholder="email@example.com (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={(v) => setRole(v as "editor" | "viewer")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={create} disabled={creating}>
          <Plus className="h-4 w-4" /> Create link
        </Button>
      </div>
      {invites.length > 0 && (
        <ul className="mt-4 divide-y border-t">
          {invites.map((inv) => {
            const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
            const revoked = !!inv.revoked_at;
            return (
              <li key={inv.id} className="flex items-center gap-2 py-2">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="truncate text-xs">{inviteUrl(inv.token)}</code>
                    <Badge variant="outline" className="text-[10px] capitalize">{inv.role_on_accept}</Badge>
                    {revoked && <Badge variant="destructive" className="text-[10px]">Revoked</Badge>}
                    {expired && !revoked && <Badge variant="secondary" className="text-[10px]">Expired</Badge>}
                  </div>
                  {inv.email && <span className="text-[10px] text-muted-foreground">{inv.email}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl(inv.token));
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {isOwner && !revoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await supabase.from("space_invites").update({ revoked_at: new Date().toISOString() }).eq("id", inv.id);
                      onChange();
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isOwner,
  isSelf,
  spaceId,
  onChange,
}: {
  member: Member;
  isOwner: boolean;
  isSelf: boolean;
  spaceId: string;
  onChange: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  async function changeRole(role: string) {
    setUpdating(true);
    const { error } = await supabase
      .from("space_members")
      .update({ role })
      .eq("space_id", spaceId)
      .eq("user_id", member.user_id);
    setUpdating(false);
    if (error) return toast.error(error.message);
    onChange();
  }

  async function remove() {
    const { error } = await supabase
      .from("space_members")
      .delete()
      .eq("space_id", spaceId)
      .eq("user_id", member.user_id);
    if (error) return toast.error(error.message);
    toast.success(isSelf ? "Left space" : "Removed");
    onChange();
  }

  const canChangeRole = isOwner && !isSelf && member.role !== "owner";
  const canRemove = (isOwner && !isSelf && member.role !== "owner") || (isSelf && member.role !== "owner");

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar className="h-9 w-9">
        <AvatarFallback className="text-xs">{initials(member.display_name, member.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {member.display_name ?? member.email ?? "Member"}
          {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
      </div>
      {canChangeRole ? (
        <Select value={member.role} onValueChange={changeRole} disabled={updating}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="text-[10px] capitalize">{member.role}</Badge>
      )}
      {canRemove && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isSelf ? "Leave this space?" : "Remove member?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isSelf
                  ? "You will lose access to this space."
                  : `Remove ${member.display_name ?? member.email} from the space?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}

const ICONS = ["🏠", "🏢", "🏪", "🏡", "🚗", "👨‍👩‍👧", "💼", "🏖️", "🎓", "🛒"];

function SettingsPanel({
  spaceId,
  isOwner,
  initial,
  onSaved,
  onDeleted,
  currentUserId,
}: {
  spaceId: string;
  isOwner: boolean;
  initial: { name: string; icon: string; description: string; is_shared: boolean };
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  currentUserId: string;
}) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [description, setDescription] = useState(initial.description);
  const [isShared, setIsShared] = useState(initial.is_shared);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("spaces")
      .update({ name, icon, description: description || null, is_shared: isShared })
      .eq("id", spaceId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    await onSaved();
  }

  async function destroy() {
    const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
    if (error) return toast.error(error.message);
    toast.success("Space deleted");
    await onDeleted();
  }

  async function leave() {
    const { error } = await supabase
      .from("space_members")
      .delete()
      .eq("space_id", spaceId)
      .eq("user_id", currentUserId);
    if (error) return toast.error(error.message);
    await onDeleted();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
        </div>
        <div>
          <Label>Icon</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                disabled={!isOwner}
                onClick={() => setIcon(i)}
                className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition disabled:opacity-50 ${
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
            rows={2}
            disabled={!isOwner}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
          <div>
            <div className="text-sm font-medium">Shared space</div>
            <p className="text-xs text-muted-foreground">Allow inviting others.</p>
          </div>
          <Switch checked={isShared} onCheckedChange={setIsShared} disabled={!isOwner} />
        </div>
        {isOwner && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-destructive/30 bg-card p-4">
        <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {!isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Leave space</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave this space?</AlertDialogTitle>
                  <AlertDialogDescription>You will lose access immediately.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={leave}>Leave</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete space</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{initial.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All items, reminders, and history in this space will be permanently deleted. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={destroy}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}

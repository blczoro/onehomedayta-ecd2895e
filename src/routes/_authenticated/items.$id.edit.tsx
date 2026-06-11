import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CATEGORIES, DETAIL_SECTIONS, REMINDER_OPTIONS, detailsCompleteness } from "@/lib/items";
import { toast } from "sonner";
import { ChevronDown, ArrowLeft, Trash2, Check, Users } from "lucide-react";
import { VisibilityToggle } from "@/components/visibility-toggle";
import { VisibilityBadge } from "@/components/visibility-badge";
import { ShareDialog } from "@/components/share-dialog";
import { DocumentList } from "@/components/document-list";

export const Route = createFileRoute("/_authenticated/items/$id/edit")({
  head: () => ({ meta: [{ title: "Edit Application — One Home" }] }),
  component: EditItemPage,
});

function EditItemPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [reminderDays, setReminderDays] = useState("7");
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [visibility, setVisibility] = useState<"personal" | "shared">("personal");
  const [shareOpen, setShareOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (item && !initialized.current) {
      setName(item.name);
      setCategory(item.category);
      setExpiryDate(item.expiry_date);
      setReminderDays(String(item.reminder_days));
      setDetails((item.details as Record<string, unknown>) ?? {});
      setVisibility((item.visibility as "personal" | "shared") ?? "personal");
      initialized.current = true;
    }
  }, [item]);

  const sections = useMemo(
    () => DETAIL_SECTIONS[category] ?? DETAIL_SECTIONS.Other,
    [category],
  );
  const completeness = useMemo(
    () => detailsCompleteness(category, details),
    [category, details],
  );

  // Debounced auto-save
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initialized.current || !item) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const { error } = await supabase
        .from("items")
        .update({
          name,
          category,
          expiry_date: expiryDate,
          reminder_days: Number(reminderDays) || 7,
          details: details as never,
          details_complete: completeness.percent === 100,
          visibility,
        })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
      } else {
        setSavedAt(new Date());
        qc.invalidateQueries({ queryKey: ["items"] });
        qc.invalidateQueries({ queryKey: ["item", id] });
      }
    }, 700);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, category, expiryDate, reminderDays, details, visibility]);

  const updateDetail = (key: string, value: unknown) =>
    setDetails((d) => ({ ...d, [key]: value }));

  const handleDelete = async () => {
    if (!confirm("Delete this application?")) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["items"] });
    navigate({ to: "/my-items" });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!item) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Application not found.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/my-items">Back to applications</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/my-items"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <div className="text-xs text-muted-foreground">
          {savedAt ? (
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-success" /> Auto-saved</span>
          ) : (
            "Changes save automatically"
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Details progress</span>
          <span className="text-muted-foreground">
            {completeness.filled} / {completeness.total} fields
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
      </div>

      {/* Basics */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Basics</h2>
          <VisibilityBadge visibility={visibility} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Application name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiry">Expiry date</Label>
            <Input
              id="expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Reminder</Label>
          <Select value={reminderDays} onValueChange={setReminderDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REMINDER_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Visibility</Label>
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityToggle value={visibility} onChange={setVisibility} />
            {visibility === "shared" && (
              <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
                <Users className="mr-1 h-3.5 w-3.5" /> Manage sharing
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {visibility === "personal"
              ? "Only you can see this application."
              : "Invited members can view or edit this application."}
          </p>
        </div>
      </div>

      <DocumentList itemId={id} />

      {/* Category sections */}
      {sections.map((section, idx) => (
        <Collapsible key={section.title} defaultOpen={idx === 0}>
          <div className="rounded-xl border bg-card">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left">
              <span className="text-sm font-semibold">{section.title}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in">
              <div className="space-y-4 border-t px-5 py-4">
                {section.fields.map((f) => {
                  const value = (details[f.key] ?? "") as string | boolean;
                  if (f.type === "textarea") {
                    return (
                      <div key={f.key} className="space-y-2">
                        <Label>{f.label}</Label>
                        <Textarea
                          rows={3}
                          value={String(value ?? "")}
                          onChange={(e) => updateDetail(f.key, e.target.value)}
                        />
                      </div>
                    );
                  }
                  if (f.type === "boolean") {
                    return (
                      <div key={f.key} className="flex items-center justify-between">
                        <Label>{f.label}</Label>
                        <Switch
                          checked={value === true}
                          onCheckedChange={(v) => updateDetail(f.key, v)}
                        />
                      </div>
                    );
                  }
                  if (f.type === "file") {
                    return (
                      <div key={f.key} className="space-y-2">
                        <Label>{f.label}</Label>
                        <Input
                          type="file"
                          onChange={(e) => updateDetail(f.key, e.target.files?.[0]?.name ?? "")}
                        />
                        {typeof value === "string" && value && (
                          <p className="text-xs text-muted-foreground">{value}</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={f.key} className="space-y-2">
                      <Label>{f.label}</Label>
                      <Input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        value={String(value ?? "")}
                        onChange={(e) => updateDetail(f.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}

      {/* Notes */}
      <div className="rounded-xl border bg-card p-5 space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={4}
          value={String(details["notes"] ?? "")}
          onChange={(e) => updateDetail("notes", e.target.value)}
          placeholder="Add any extra details here…"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={handleDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1 h-4 w-4" /> Delete application
        </Button>
        <Button onClick={() => navigate({ to: "/my-items" })}>Done</Button>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resourceType="item"
        resourceId={id}
      />
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Warranty Reminder" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [emailNotif, setEmailNotif] = useState(true);

  const handlePwChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password needs at least 6 characters");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setPw("");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-sm font-medium">Profile</h2>
        <div className="mt-4 space-y-1 text-sm">
          <div className="text-muted-foreground">Email</div>
          <div>{user?.email}</div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-sm font-medium">Change password</h2>
        <form onSubmit={handlePwChange} className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newpw">New password</Label>
            <Input id="newpw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <Button type="submit" size="sm">Update password</Button>
        </form>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-sm font-medium">Preferences</h2>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="text-sm">Email notifications</div>
            <div className="text-xs text-muted-foreground">Get reminders by email.</div>
          </div>
          <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="text-sm">Dark mode</div>
            <div className="text-xs text-muted-foreground">Switch theme appearance.</div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <Button variant="outline" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
          Sign out
        </Button>
      </section>
    </div>
  );
}

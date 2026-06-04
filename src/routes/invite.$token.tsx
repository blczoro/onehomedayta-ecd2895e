import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpaces } from "@/hooks/use-spaces";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Join Space — Warranty Reminder" }] }),
  component: InvitePage,
});

type Preview = {
  space_id: string | null;
  name: string | null;
  icon: string | null;
  description: string | null;
  role_on_accept: string | null;
  is_valid: boolean;
  reason: string | null;
};

function InvitePage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const { setCurrentSpaceId, refresh } = useSpaces();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.rpc("preview_space_invite", { _token: token });
      if (alive) setPreview((data?.[0] as Preview) ?? null);
    })();
    return () => { alive = false; };
  }, [token]);

  async function accept() {
    if (!user) {
      try { localStorage.setItem("wr.pendingInvite", token); } catch {}
      navigate({ to: "/login" });
      return;
    }
    setAccepting(true);
    const { data, error } = await supabase.rpc("accept_space_invite", { _token: token });
    setAccepting(false);
    if (error) return toast.error(error.message);
    toast.success("You joined the space");
    await refresh();
    if (data) setCurrentSpaceId(data as string);
    navigate({ to: "/spaces/$id", params: { id: data as string } });
  }

  if (!preview) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading invite…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        {!preview.is_valid ? (
          <>
            <h1 className="text-lg font-semibold">Invite unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {preview.reason === "not_found" && "This invite link doesn't exist."}
              {preview.reason === "revoked" && "This invite was revoked."}
              {preview.reason === "expired" && "This invite has expired."}
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="text-5xl">{preview.icon}</div>
            <h1 className="mt-3 text-lg font-semibold">Join "{preview.name}"</h1>
            {preview.description && (
              <p className="mt-1 text-sm text-muted-foreground">{preview.description}</p>
            )}
            <Badge variant="outline" className="mt-3 text-xs capitalize">
              Joining as {preview.role_on_accept}
            </Badge>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={accept} disabled={accepting || loading}>
                {user ? (accepting ? "Joining…" : "Accept & join") : "Sign in to join"}
              </Button>
              <Button asChild variant="ghost">
                <Link to="/">Cancel</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

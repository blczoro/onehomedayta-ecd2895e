import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { acceptShareInvite } from "@/lib/sharing.functions";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invite — One Home" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptShareInvite);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<{ type: "item" | "reminder"; id: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    accept({ data: { token } })
      .then((res) => {
        if (cancelled) return;
        setTarget({ type: res.resource_type, id: res.resource_id });
        setState("ok");
        setMessage(res.alreadyOwner ? "You're the owner of this resource." : "You now have access.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "Could not accept invite.");
      });
    return () => { cancelled = true; };
  }, [token, accept]);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {state === "loading" && <Loader2 className="h-6 w-6 animate-spin" />}
          {state === "ok" && <CheckCircle2 className="h-6 w-6 text-success" />}
          {state === "error" && <AlertTriangle className="h-6 w-6 text-destructive" />}
        </div>
        <h1 className="mt-4 text-base font-semibold">
          {state === "loading" ? "Accepting invite…" : state === "ok" ? "Invite accepted" : "Invite issue"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>

        {state === "ok" && (
          <div className="mt-5 flex justify-center gap-2">
            <Button
              onClick={() => {
                if (target?.type === "item") {
                  navigate({ to: "/my-items" });
                } else {
                  navigate({ to: "/reminders" });
                }
              }}
            >
              <Users className="mr-1 h-4 w-4" />
              {target?.type === "item" ? "View shared items" : "View shared reminders"}
            </Button>
          </div>
        )}
        {state === "error" && (
          <Button variant="outline" className="mt-5" onClick={() => navigate({ to: "/dashboard" })}>
            Go to dashboard
          </Button>
        )}
      </div>
    </div>
  );
}

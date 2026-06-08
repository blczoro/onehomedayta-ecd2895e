import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Bell, Shield, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "One Home — Your personal data organizer" },
      {
        name: "description",
        content:
          "Organize your applications, warranties, renewals, reminders, and documents in one place.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Bell className="h-5 w-5 text-primary" />
            <BrandLogo size="md" />
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Sign up</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Your personal data, organized.
        </h1>
        <p className="mt-5 text-base text-muted-foreground sm:text-lg">
          One Home keeps your applications, warranties, renewals, documents, and reminders in one private place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">I have an account</Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            { icon: Shield, title: "Warranties", text: "Electronics, furniture, appliances." },
            { icon: Calendar, title: "Renewals", text: "Insurance, subscriptions, services." },
            { icon: FileText, title: "Documents", text: "Save bills and receipts in one place." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 text-left">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-sm text-muted-foreground">
          A simple reminder tool.
        </div>
      </footer>
    </div>
  );
}

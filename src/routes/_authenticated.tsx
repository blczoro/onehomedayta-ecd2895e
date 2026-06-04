import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Bell, LayoutDashboard, Plus, List, BellRing, Settings, LogOut, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { SpaceSwitcher } from "@/components/space-switcher";
import { NotificationsBell } from "@/components/notifications-bell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Add Item", url: "/add-item", icon: Plus },
  { title: "My Items", url: "/my-items", icon: List },
  { title: "Reminders", url: "/reminders", icon: BellRing },
  { title: "Spaces", url: "/spaces", icon: Users },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

function AuthLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-3 py-3">
            <div className="flex items-center gap-2 font-semibold px-1 pb-2">
              <Bell className="h-5 w-5 text-primary shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Warranty Reminder</span>
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <SpaceSwitcher />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((it) => (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={pathname === it.url || pathname.startsWith(it.url + "/")} tooltip={it.title}>
                        <Link to={it.url}>
                          <it.icon className="h-4 w-4" />
                          <span>{it.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => signOut().then(() => navigate({ to: "/" }))} tooltip="Sign out">
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="text-sm font-medium capitalize">
              {pathname.replace("/", "").split("/")[0].replace("-", " ") || "Dashboard"}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationsBell />
              <span className="hidden text-xs text-muted-foreground sm:block">{user.email}</span>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

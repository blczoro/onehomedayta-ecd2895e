import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Users } from "lucide-react";
import { useSpaces } from "@/hooks/use-spaces";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SpaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { spaces, currentSpace, setCurrentSpaceId } = useSpaces();

  if (!currentSpace) {
    return (
      <Button asChild variant="outline" size="sm" className="w-full justify-start">
        <Link to="/spaces">
          <Plus className="h-4 w-4" /> Create space
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-between gap-2 h-auto py-2",
            collapsed && "px-2",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-base">{currentSpace.icon}</span>
            {!collapsed && (
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate text-sm font-medium leading-tight">{currentSpace.name}</span>
                <span className="truncate text-[10px] text-muted-foreground leading-tight">
                  {currentSpace.is_shared ? "Shared" : "Private"} · {currentSpace.role}
                </span>
              </span>
            )}
          </span>
          {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel className="text-xs">Switch space</DropdownMenuLabel>
        {spaces.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => setCurrentSpaceId(s.id)}
            className="gap-2"
          >
            <span className="text-base">{s.icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{s.name}</span>
              <span className="truncate text-[10px] text-muted-foreground">
                {s.is_shared ? "Shared" : "Private"} · {s.role}
              </span>
            </span>
            {s.id === currentSpace.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/spaces">
            <Users className="h-4 w-4" /> Manage spaces
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/spaces" search={{ create: 1 }}>
            <Plus className="h-4 w-4" /> Create new space
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

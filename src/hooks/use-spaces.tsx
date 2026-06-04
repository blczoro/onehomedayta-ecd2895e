import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type Space = {
  id: string;
  owner_id: string;
  name: string;
  icon: string;
  description: string | null;
  is_shared: boolean;
  created_at: string;
};

export type SpaceWithRole = Space & { role: "owner" | "editor" | "viewer" };

interface SpacesContextValue {
  spaces: SpaceWithRole[];
  currentSpace: SpaceWithRole | null;
  currentSpaceId: string | null;
  setCurrentSpaceId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  canEdit: boolean;
  isOwner: boolean;
}

const SpacesContext = createContext<SpacesContextValue | undefined>(undefined);

const STORAGE_KEY = "wr.currentSpaceId";

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [spaces, setSpaces] = useState<SpaceWithRole[]>([]);
  const [currentSpaceId, _setCurrentSpaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSpaces([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("space_members")
      .select("role, space:spaces(*)")
      .eq("user_id", user.id);
    if (error) {
      console.error("[spaces] load failed", error);
      setLoading(false);
      return;
    }
    const rows: SpaceWithRole[] = (data ?? [])
      .map((r: { role: string; space: Space | null }) =>
        r.space ? { ...r.space, role: r.role as SpaceWithRole["role"] } : null,
      )
      .filter((x): x is SpaceWithRole => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Ensure a Personal space exists for new users
    if (rows.length === 0) {
      const { data: newSpace, error: createErr } = await supabase
        .from("spaces")
        .insert({
          owner_id: user.id,
          name: "Personal",
          icon: "🏠",
          description: "Your personal space",
          is_shared: false,
        })
        .select("*")
        .single();
      if (!createErr && newSpace) {
        await supabase
          .from("space_members")
          .insert({ space_id: newSpace.id, user_id: user.id, role: "owner" });
        rows.push({ ...newSpace, role: "owner" });
      }
    }

    setSpaces(rows);

    // pick current
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    let pick = stored && rows.find((s) => s.id === stored) ? stored : null;
    if (!pick) {
      const personal = rows.find((s) => s.name === "Personal" && s.role === "owner");
      pick = personal?.id ?? rows[0]?.id ?? null;
    }
    _setCurrentSpaceId(pick);
    if (pick && typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, pick);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    refresh();
  }, [authLoading, refresh]);

  // Live updates: refresh on membership changes
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("space_members_self")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "space_members", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refresh]);

  const setCurrentSpaceId = useCallback((id: string) => {
    _setCurrentSpaceId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const currentSpace = useMemo(
    () => spaces.find((s) => s.id === currentSpaceId) ?? null,
    [spaces, currentSpaceId],
  );

  const canEdit = currentSpace?.role === "owner" || currentSpace?.role === "editor";
  const isOwner = currentSpace?.role === "owner";

  return (
    <SpacesContext.Provider
      value={{
        spaces,
        currentSpace,
        currentSpaceId,
        setCurrentSpaceId,
        loading,
        refresh,
        canEdit,
        isOwner,
      }}
    >
      {children}
    </SpacesContext.Provider>
  );
}

export function useSpaces() {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error("useSpaces must be used within SpacesProvider");
  return ctx;
}

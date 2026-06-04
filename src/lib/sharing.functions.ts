import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const acceptInput = z.object({ token: z.string().min(8).max(128) });

export const acceptShareInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => acceptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
      .from("share_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found.");
    if (invite.revoked) throw new Error("This invite has been revoked.");
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new Error("This invite has expired.");
    }
    if (invite.owner_id === userId) {
      return {
        resource_type: invite.resource_type as "item" | "reminder",
        resource_id: invite.resource_id as string,
        alreadyOwner: true,
      };
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("shares")
      .upsert(
        {
          owner_id: invite.owner_id,
          resource_type: invite.resource_type,
          resource_id: invite.resource_id,
          member_user_id: userId,
          role: invite.role,
        },
        { onConflict: "resource_type,resource_id,member_user_id" },
      );
    if (upsertErr) throw new Error(upsertErr.message);

    return {
      resource_type: invite.resource_type as "item" | "reminder",
      resource_id: invite.resource_id as string,
      alreadyOwner: false,
    };
  });

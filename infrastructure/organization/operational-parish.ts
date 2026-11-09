import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/infrastructure/config/server";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";
import { AppError } from "@/shared/errors/app-error";

export const OPERATIONAL_PARISH_NAME = "SS Joachim and Anne Catholic Church, Ijegun";

const configuredParishSchema = z.string().uuid();
const parishRowSchema = z.object({
  id: z.string().uuid(),
  unit_type: z.literal("parish"),
  name: z.literal(OPERATIONAL_PARISH_NAME),
});

export interface OperationalParish {
  readonly id: string;
  readonly type: "parish";
  readonly name: typeof OPERATIONAL_PARISH_NAME;
}

type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

interface OperationalParishResolverDependencies {
  readonly getClient?: () => AdminSupabaseClient;
  readonly getConfiguredParishId?: () => string | undefined;
}

function unavailable(): AppError {
  return new AppError("infrastructure", "Operational parish is unavailable.");
}

/**
 * Resolves the one configured operational parish using a server-only, read-only query.
 * The UUID is deployment configuration, never a request parameter. RLS hides org_units
 * from a prospective applicant, so the server-only service client reads only this fixed
 * row and returns only its identifier, type, and canonical name.
 */
export function createOperationalParishResolver(
  dependencies: OperationalParishResolverDependencies = {},
): () => Promise<OperationalParish> {
  const getClient = dependencies.getClient ?? createAdminSupabaseClient;
  const getConfiguredParishId =
    dependencies.getConfiguredParishId ?? (() => getServerEnv().CYON_ACTIVE_PARISH_ID);

  return async () => {
    try {
      const configuredId = getConfiguredParishId();
      const parsedId = configuredParishSchema.safeParse(configuredId);
      if (!parsedId.success) throw unavailable();

      const { data, error } = await getClient()
        .from("org_units")
        .select("id,unit_type,name")
        .eq("id", parsedId.data)
        .maybeSingle();

      if (error || data === null) throw unavailable();

      const parish = parishRowSchema.safeParse(data);
      if (!parish.success || parish.data.id !== parsedId.data) throw unavailable();

      return {
        id: parish.data.id,
        type: parish.data.unit_type,
        name: parish.data.name,
      };
    } catch {
      // Do not expose config values, database details, or service-role failures.
      throw unavailable();
    }
  };
}

/** Reusable server-side entry point for future application and review composition roots. */
export const resolveOperationalParish = createOperationalParishResolver();

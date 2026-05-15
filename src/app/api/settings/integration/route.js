import { NextResponse } from "next/server";

import {
  getPublicIntegrationDefinitions,
  isIntegrationSettingsTableError,
  envMapToDbRow,
  mergeIntegrationSettings,
  rowToEnvMap,
  toPublicSettingsResponse,
} from "@/lib/account-integration-settings";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("account_integration_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      if (isIntegrationSettingsTableError(error.message)) {
        const publicSettings = toPublicSettingsResponse(null);
        return NextResponse.json({
          ok: true,
          ...publicSettings,
          definitions: getPublicIntegrationDefinitions(),
          updatedAt: null,
          dbReady: false,
          dbError: error.message,
        });
      }
      throw new Error(error.message);
    }

    const publicSettings = toPublicSettingsResponse(data);
    return NextResponse.json({
      ok: true,
      ...publicSettings,
      definitions: getPublicIntegrationDefinitions(),
      updatedAt: data?.updated_at || null,
      dbReady: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load integration settings",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const patch = body?.fields && typeof body.fields === "object" ? body.fields : body;

    const { data: existing, error: loadError } = await supabase
      .from("account_integration_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      if (isIntegrationSettingsTableError(loadError.message)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Integration settings table missing",
            details: loadError.message,
            dbReady: false,
            migrationFile:
              "supabase/migrations/20260515120000_account_integration_settings.sql, 20260516140000_account_integration_settings_env_columns.sql",
          },
          { status: 503 }
        );
      }
      throw new Error(loadError.message);
    }

    const merged = mergeIntegrationSettings(existing, patch);
    const payload = envMapToDbRow(user.id, merged);

    const { error: saveError } = await supabase
      .from("account_integration_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (saveError) {
      throw new Error(saveError.message);
    }

    const publicSettings = toPublicSettingsResponse(merged);
    return NextResponse.json({
      ok: true,
      ...publicSettings,
      updatedAt: payload.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save integration settings",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

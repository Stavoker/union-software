import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { isAccountFrozen } from "@/shared/lib/supabase/is-account-frozen";

const intlMiddleware = createMiddleware(routing);

function localeFromPath(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return routing.locales.includes(first as (typeof routing.locales)[number])
    ? first
    : routing.defaultLocale;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/generator")) {
    return NextResponse.next();
  }

  /** API генератора — без intl; заморожений акаунт не має доступу. */
  if (pathname.startsWith("/api/generator")) {
    if (!url || !anon) {
      return NextResponse.next();
    }
    const res = NextResponse.next();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && (await isAccountFrozen(supabase, user.id))) {
      const forbidden = NextResponse.json(
        { ok: false, error: "account_frozen", code: "ACCOUNT_FROZEN" },
        { status: 403 }
      );
      const supabaseOut = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              forbidden.cookies.set(name, value, options);
            });
          },
        },
      });
      await supabaseOut.auth.signOut();
      return forbidden;
    }
    return res;
  }

  const response = intlMiddleware(request);

  if (!url || !anon) {
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && (await isAccountFrozen(supabase, user.id))) {
    const locale = localeFromPath(pathname);
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}`;
    loginUrl.searchParams.set("account", "frozen");

    const redirectResponse = NextResponse.redirect(loginUrl);
    const supabaseSignOut = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    });
    await supabaseSignOut.auth.signOut();
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};

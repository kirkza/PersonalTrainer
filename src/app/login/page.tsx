import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, createToken } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const pin = String(formData.get("pin") ?? "");
  if (!process.env.APP_PIN || pin !== process.env.APP_PIN) {
    redirect("/login?error=1");
  }
  const token = await createToken(process.env.AUTH_SECRET ?? "");
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <div className="text-center">
        <div className="text-4xl">🏋️</div>
        <h1 className="mt-2 text-xl font-semibold">Personal Fitness Trainer</h1>
        <p className="mt-1 text-sm text-muted">Enter your PIN to continue</p>
      </div>
      <form action={login} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          name="pin"
          inputMode="numeric"
          autoFocus
          placeholder="PIN"
          className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-accent"
        />
        {error && (
          <p className="text-center text-sm text-danger">Wrong PIN, try again.</p>
        )}
        <button
          type="submit"
          className="rounded-xl bg-accent-strong px-4 py-3 font-semibold text-black"
        >
          Unlock
        </button>
      </form>
    </main>
  );
}

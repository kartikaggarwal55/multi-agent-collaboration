// CHANGED: Custom sign-in page with Google OAuth
import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Google icon SVG
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default async function SignInPage() {
  // CHANGED: Check if already signed in
  const session = await auth();
  if (session?.user) {
    redirect("/me/assistant");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-[oklch(0.97_0.02_260)]">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[oklch(0.55_0.18_280)] to-[oklch(0.50_0.20_300)] flex items-center justify-center shadow-lg">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
              <path d="M19 15L20 18L23 19L20 20L19 23L18 20L15 19L18 18L19 15Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-serif font-semibold tracking-tight mb-2">
            Welcome Back
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in to access your personal assistant
          </p>
        </div>

        <div className="space-y-4">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/me/assistant" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors font-medium"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/30" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-background text-muted-foreground">
                Secure authentication
              </span>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By signing in, you agree to allow calendar read access for
            scheduling assistance.
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-border/30 text-center">
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Collaboration Room
          </a>
        </div>
      </div>
    </div>
  );
}

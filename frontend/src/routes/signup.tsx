import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — MKChain Forensics" },
      { name: "description", content: "Create a free MKChain account to analyze blockchain wallets, trace transaction flows, and monitor sanctioned addresses." },
      { property: "og:title", content: "Create account — MKChain Forensics" },
      { property: "og:description", content: "Start analyzing blockchain transactions for free." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const longEnough = password.length >= 6;
  const matches = confirm.length > 0 && password === confirm;
  const canSubmit = longEnough && matches && email.includes("@") && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (data.session) {
      navigate({ to: "/analyze", search: {}, replace: true });
      return;
    }
    setConfirmSent(true);
  }

  if (confirmSent) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="glass w-full max-w-[400px] rounded-xl p-7 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-success/40 bg-success/10">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-data text-foreground">{email}</span>. Confirm your address, then sign in.
          </p>
          <Button asChild variant="outline" className="mt-6 h-11 w-full">
            <Link to="/login" search={{}}>Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="glass w-full max-w-[400px] rounded-xl p-7">
        <div className="flex flex-col items-center text-center">
          <span className="bg-primary flex h-11 w-11 items-center justify-center rounded-xl">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Create Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start analyzing blockchain transactions for free.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 bg-muted-surface pl-9" placeholder="analyst@agency.gov" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 bg-muted-surface pl-9" placeholder="••••••••" />
            </div>
            <p className={cn("text-xs", password.length === 0 ? "text-muted-foreground" : longEnough ? "text-success" : "text-warning")}>
              At least 6 characters {password.length > 0 ? `(${password.length})` : ""}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 bg-muted-surface pl-9" placeholder="••••••••" />
            </div>
            {confirm.length > 0 ? (
              <p className={cn("text-xs", matches ? "text-success" : "text-warning")}>{matches ? "Passwords match" : "Passwords do not match"}</p>
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" disabled={!canSubmit} className="bg-primary h-11 w-full font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create Account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" search={{}} className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Mail, Users, Building2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export const Route = createFileRoute('/invite/$token')({
  component: InviteAcceptPage,
});

interface Invite {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  invited_at: string;
  expires_at: string;
  accepted_at?: string;
  organization?: {
    name: string;
    slug: string;
    plan_tier: string;
  };
}

function InviteAcceptPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: invite, isLoading, error } = useQuery<Invite>({
    queryKey: ['invite', token],
    queryFn: () => endpoints.getInvite(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => endpoints.acceptInvite(token),
    onSuccess: () => {
      toast.success('Welcome to the team!');
      // Redirect to organization after short delay
      setTimeout(() => {
        navigate({ to: '/' });
      }, 1500);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to accept invitation');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-destructive/10">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle>Invalid Invitation</CardTitle>
                <CardDescription>This invitation link is not valid</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The invitation may have expired, been revoked, or the link is incorrect.
            </p>
            <Button onClick={() => navigate({ to: '/' })} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if already accepted
  if (invite.accepted_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-500/10">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <CardTitle>Already Accepted</CardTitle>
                <CardDescription>You've already joined this organization</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: '/' })} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if expired
  const isExpired = new Date(invite.expires_at) < new Date();

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-destructive/10">
                <Clock className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle>Invitation Expired</CardTitle>
                <CardDescription>This invitation has expired</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This invitation expired on {format(new Date(invite.expires_at), 'PPP')}.
              Please contact the organization admin for a new invitation.
            </p>
            <Button onClick={() => navigate({ to: '/' })} variant="outline" className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if user is logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Sign In Required</CardTitle>
                <CardDescription>Sign in to accept this invitation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">You've been invited to:</p>
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-semibold">{invite.organization?.name || 'Organization'}</p>
                <p className="text-sm text-muted-foreground">as {invite.role}</p>
              </div>
            </div>
            <Button
              onClick={() => navigate({ to: '/login', search: { redirect: `/invite/${token}` } })}
              className="w-full"
            >
              Sign In to Accept
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Don't have an account? Sign up to join the team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ready to accept
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Team Invitation</CardTitle>
              <CardDescription>You've been invited to join a team</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Organization Details */}
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
              <Building2 className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{invite.organization?.name || 'Organization'}</p>
                <p className="text-sm text-muted-foreground">
                  {invite.organization?.slug || 'organization'}
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {invite.organization?.plan_tier || 'free'}
              </Badge>
            </div>

            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Your Role</p>
                <p className="text-sm text-muted-foreground capitalize">{invite.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Invitation Expires</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(invite.expires_at), 'PPP')}
                </p>
              </div>
            </div>
          </div>

          {/* Role Permissions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What you'll be able to do:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              {invite.role === 'admin' && (
                <>
                  <li>Manage team members and settings</li>
                  <li>Create and manage analyses</li>
                  <li>View all reports and data</li>
                  <li>Configure billing and subscriptions</li>
                </>
              )}
              {invite.role === 'analyst' && (
                <>
                  <li>Create blockchain analyses</li>
                  <li>Generate reports</li>
                  <li>Manage alerts and watchlists</li>
                  <li>View team data</li>
                </>
              )}
              {invite.role === 'viewer' && (
                <>
                  <li>View analyses and reports</li>
                  <li>Browse OSINT data</li>
                  <li>Access team resources</li>
                </>
              )}
            </ul>
          </div>

          {/* Accept Button */}
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            className="w-full"
            size="lg"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Joining...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Accept Invitation
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By accepting, you agree to join this organization and follow its policies.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

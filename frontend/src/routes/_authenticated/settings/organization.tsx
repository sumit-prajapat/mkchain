import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';
import { endpoints } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Building2, Save, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const Route = createFileRoute('/_authenticated/settings/organization')({
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { currentOrg, refreshOrganizations } = useOrganization();
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentOrg?.name || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (newName: string) =>
      endpoints.updateOrganization(currentOrg!.id, { name: newName }),
    onSuccess: () => {
      toast.success('Organization updated');
      refreshOrganizations();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to update organization');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => endpoints.deleteOrganization(currentOrg!.id),
    onSuccess: () => {
      toast.success('Organization deleted');
      refreshOrganizations();
      // User will be redirected when organizations reload
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete organization');
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Organization name is required');
      return;
    }
    updateMutation.mutate(name.trim());
  };

  const handleDelete = () => {
    deleteMutation.mutate();
    setShowDeleteConfirm(false);
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
          <p className="text-muted-foreground">Manage your organization details</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Update your organization name and details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter organization name"
                className="max-w-md"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-slug">Organization Slug</Label>
              <Input
                id="org-slug"
                value={currentOrg.slug}
                disabled
                className="max-w-md bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Slug cannot be changed after creation
              </p>
            </div>

            <div className="space-y-2">
              <Label>Plan Tier</Label>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold capitalize">{currentOrg.plan_tier}</span>
                {currentOrg.plan_tier === 'free' && (
                  <Button variant="outline" size="sm" asChild>
                    <a href="/billing">Upgrade</a>
                  </Button>
                )}
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || name === currentOrg.name}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions for this organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Delete Organization</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this organization and all its data
                </p>
              </div>
              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{currentOrg.name}</strong> and all associated data:
                      <ul className="mt-2 list-disc list-inside space-y-1">
                        <li>All analyses and reports</li>
                        <li>All team members</li>
                        <li>All alerts and watched addresses</li>
                        <li>Subscription and billing history</li>
                      </ul>
                      <p className="mt-3 font-semibold">This action cannot be undone.</p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Deleting...
                        </>
                      ) : (
                        'Delete Organization'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

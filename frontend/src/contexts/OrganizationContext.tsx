import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { endpoints } from '@/lib/api';

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  created_at: string;
  owner_id: string;
}

interface OrganizationContextType {
  currentOrg: Organization | null;
  organizations: Organization[];
  switchOrganization: (orgId: string) => void;
  loading: boolean;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      
      // Check if user is authenticated first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const orgs = await endpoints.listOrganizations();
      setOrganizations(orgs);

      // Set current org from localStorage or use first org
      const savedOrgId = localStorage.getItem('currentOrgId');
      if (savedOrgId) {
        const saved = orgs.find(o => o.id === savedOrgId);
        if (saved) {
          setCurrentOrg(saved);
          return;
        }
      }

      // Default to first org
      if (orgs.length > 0) {
        setCurrentOrg(orgs[0]);
        localStorage.setItem('currentOrgId', orgs[0].id);
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
      // Don't throw - just log and continue
    } finally {
      setLoading(false);
    }
  };

  const switchOrganization = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      localStorage.setItem('currentOrgId', orgId);
    }
  };

  const refreshOrganizations = async () => {
    await loadOrganizations();
  };

  useEffect(() => {
    // Load organizations when user logs in
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        loadOrganizations();
      } else if (event === 'SIGNED_OUT') {
        setCurrentOrg(null);
        setOrganizations([]);
        localStorage.removeItem('currentOrgId');
        setLoading(false);
      }
    });

    // Load on mount if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadOrganizations();
      } else {
        setLoading(false);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <OrganizationContext.Provider
      value={{
        currentOrg,
        organizations,
        switchOrganization,
        loading,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}

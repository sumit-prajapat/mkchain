-- ============================================================================
-- Data Migration: Create Default Organizations for Existing Users
-- ============================================================================
-- Run AFTER 001_add_multi_tenancy.sql
-- ============================================================================

-- Create default organization for each existing user
DO $'
DECLARE
  user_record RECORD;
  new_org_id UUID;
  user_email TEXT;
BEGIN
  FOR user_record IN 
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE id NOT IN (SELECT DISTINCT owner_id FROM organizations)
  LOOP
    -- Get user email
    user_email := COALESCE(user_record.email, 'User ' || substring(user_record.id::text, 1, 8));
    
    -- Create organization
    INSERT INTO organizations (name, slug, owner_id, plan_tier)
    VALUES (
      user_email || '''s Organization',
      generate_org_slug(user_email),
      user_record.id,
      'free'
    )
    RETURNING id INTO new_org_id;
    
    -- Add user as owner member
    INSERT INTO organization_members (organization_id, user_id, role, joined_at)
    VALUES (new_org_id, user_record.id, 'owner', NOW());
    
    -- Migrate existing analyses
    UPDATE analyses
    SET organization_id = new_org_id
    WHERE user_id = user_record.id
    AND organization_id IS NULL;
    
    -- Migrate existing watched addresses
    UPDATE watched_addresses
    SET organization_id = new_org_id
    WHERE user_id = user_record.id
    AND organization_id IS NULL;
    
    -- Migrate existing alerts
    UPDATE alerts
    SET organization_id = new_org_id
    WHERE user_id = user_record.id
    AND organization_id IS NULL;
    
    RAISE NOTICE 'Created organization % for user %', new_org_id, user_record.email;
  END LOOP;
END;
$';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check all users have organizations
SELECT 
  COUNT(*) as total_users,
  COUNT(DISTINCT o.owner_id) as users_with_orgs
FROM auth.users u
LEFT JOIN organizations o ON u.id = o.owner_id;

-- Check all analyses have organizations
SELECT 
  COUNT(*) as total_analyses,
  COUNT(organization_id) as analyses_with_org
FROM analyses;

-- Check orphaned records
SELECT 'Analyses without org' as type, COUNT(*) as count
FROM analyses WHERE organization_id IS NULL
UNION ALL
SELECT 'Watchlists without org', COUNT(*)
FROM watched_addresses WHERE organization_id IS NULL
UNION ALL
SELECT 'Alerts without org', COUNT(*)
FROM alerts WHERE organization_id IS NULL;

-- ============================================================================
-- After verification, make organization_id required
-- ============================================================================

-- Uncomment ONLY after verifying all data is migrated:
-- ALTER TABLE analyses ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE watched_addresses ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE alerts ALTER COLUMN organization_id SET NOT NULL;

-- ============================================================================
-- Migration Complete!
-- ============================================================================

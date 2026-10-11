BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = '82106574-54df-4e94-abdd-0a5dafb5a717'
  ) THEN
    RAISE EXCEPTION 'Safety check failed: User D does not exist in this test project.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_accounts
    WHERE auth_user_id = '82106574-54df-4e94-abdd-0a5dafb5a717'
  ) THEN
    RAISE EXCEPTION 'Safety check failed: User D already has an application account.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.org_units
    WHERE name = 'CYON Security Test Parish B'
  ) THEN
    RAISE EXCEPTION 'Safety check failed: the test parish already exists.';
  END IF;
END $$;

WITH new_parish AS (
  INSERT INTO public.org_units (
    unit_type,
    name,
    parent_id,
    parent_type
  )
  VALUES (
    'parish',
    'CYON Security Test Parish B',
    NULL,
    NULL
  )
  RETURNING id
),
new_member AS (
  INSERT INTO public.members (
    org_unit_id,
    org_unit_type,
    membership_status
  )
  SELECT id, 'parish', 'active'
  FROM new_parish
  RETURNING id
)
INSERT INTO public.user_accounts (
  auth_user_id,
  member_id,
  account_status
)
SELECT
  '82106574-54df-4e94-abdd-0a5dafb5a717',
  id,
  'active'
FROM new_member;

COMMIT;

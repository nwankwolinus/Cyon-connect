BEGIN;

DO $$
BEGIN
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'Database safety check failed.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.user_accounts
    WHERE auth_user_id IN (
      'c98e47a4-b678-458e-a7e5-152d22d50820',
      '57542aee-182c-403d-bd08-771e58c73112',
      '395d16ef-07ca-41b5-a8d1-2ce488f8740b',
      '82106574-54df-4e94-abdd-0a5dafb5a717'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'Safety check failed: expected four test accounts.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.members
    WHERE id IN (
      '61c5a91e-487c-45c9-896b-f4eba0629a2c',
      'f7b5e1d6-3873-4f88-8996-30e989a08344',
      '729d497e-a566-47be-897e-dc0831a654f7',
      '18554cd6-68a8-447c-97b3-25f0d59ebb58'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'Safety check failed: expected four test memberships.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_units
    WHERE id = '12eda499-5f67-4d6f-b080-af102d384b07'
      AND name = 'CYON Security Test Parish B'
  ) THEN
    RAISE EXCEPTION 'Safety check failed: test parish identity mismatch.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_units
    WHERE id = '2ba858fc-a1bc-448f-9d09-7249d59457f5'
      AND name = 'SS Joachim and Anne Catholic Church, Ijegun'
  ) THEN
    RAISE EXCEPTION 'Safety check failed: original parish not found.';
  END IF;
END $$;

DELETE FROM public.user_accounts
WHERE auth_user_id IN (
  'c98e47a4-b678-458e-a7e5-152d22d50820',
  '57542aee-182c-403d-bd08-771e58c73112',
  '395d16ef-07ca-41b5-a8d1-2ce488f8740b',
  '82106574-54df-4e94-abdd-0a5dafb5a717'
);

DELETE FROM public.members
WHERE id IN (
  '61c5a91e-487c-45c9-896b-f4eba0629a2c',
  'f7b5e1d6-3873-4f88-8996-30e989a08344',
  '729d497e-a566-47be-897e-dc0831a654f7',
  '18554cd6-68a8-447c-97b3-25f0d59ebb58'
);

DELETE FROM public.org_units
WHERE id = '12eda499-5f67-4d6f-b080-af102d384b07'
  AND name = 'CYON Security Test Parish B';

COMMIT;

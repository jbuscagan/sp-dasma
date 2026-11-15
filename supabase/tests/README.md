# Database tests

Checks the migration and the security rules (who can see / change what) on a plain local Postgres.

```bash
createdb sp_test
psql -d sp_test -f supabase/tests/supabase_stub.sql \
  -f supabase/migrations/0001_init.sql -f supabase/migrations/0002_seed_barangays.sql
psql -d sp_test -f supabase/migrations/0003_sprint2_budget_privacy.sql -f supabase/migrations/0004_seed_organizations.sql -f supabase/migrations/0005_sprint3_workflow.sql -f supabase/migrations/0006_sprint4_orgs_permissions_audit.sql
psql -d sp_test -f supabase/tests/rls_test.sql -f supabase/tests/rls_test_sprint2.sql -f supabase/tests/rls_test_sprint3.sql -f supabase/tests/rls_test_sprint4.sql   # every line should say PASS
dropdb sp_test
```

`supabase_stub.sql` imitates the parts of Supabase the schema needs (auth, storage, roles). Never run it on the real Supabase project.

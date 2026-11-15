# Database tests

Checks the database design and the security rules (who can see / change what) on a plain local Postgres.

```bash
createdb sp_test
psql -d sp_test -f supabase/tests/supabase_stub.sql -f supabase/setup.sql
psql -d sp_test -f supabase/setup.sql                      # running it again must also succeed
psql -d sp_test -f supabase/tests/security_test.sql        # every line should say PASS
psql -d sp_test -f supabase/tests/cleanup_test_data.sql -f supabase/setup.sql -f supabase/tests/cleanup_test.sql   # PASS
dropdb sp_test
```

`supabase_stub.sql` imitates the parts of Supabase the design needs (auth, storage, roles). Never run it on the real Supabase project.

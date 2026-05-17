-- Drop role column from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- Drop enum type if present and unused
DROP TYPE IF EXISTS "UserRole";

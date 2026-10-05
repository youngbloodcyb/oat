import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { Signer } from "@aws-sdk/rds-signer";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

// drizzle-kit doesn't load Next.js env files on its own.
config({ path: ".env.local", quiet: true });

// `generate`/`up`/`check` never connect to the DB, so skip the RDS IAM token
// (which needs live AWS credentials) when the AWS env vars aren't present.
// DB-connecting commands (migrate/push/introspect/studio) run with creds
// available and get the real connection string.
const canSign = !!(
  process.env.AWS_REGION &&
  process.env.AWS_ROLE_ARN &&
  process.env.PGHOST &&
  process.env.PGUSER &&
  process.env.PGDATABASE
);

const token = canSign
  ? await new Signer({
      hostname: process.env.PGHOST!,
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER!,
      region: process.env.AWS_REGION!,
      credentials: awsCredentialsProvider({
        roleArn: process.env.AWS_ROLE_ARN!,
        clientConfig: { region: process.env.AWS_REGION! },
      }),
    }).getAuthToken()
  : "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/drizzle",
  dbCredentials: {
    url: `postgresql://${process.env.PGUSER ?? "postgres"}:${encodeURIComponent(token)}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE ?? "postgres"}?sslmode=${process.env.PGSSLMODE ?? "require"}`,
  },
});

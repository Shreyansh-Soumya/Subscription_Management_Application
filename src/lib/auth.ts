import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { ensureCustomerRecord } from "@/lib/accounts";
import { sendEmail } from "@/lib/email";
import { passwordProblem } from "@/lib/password";

const PATHS_SETTING_A_PASSWORD = new Set(["/sign-up/email", "/reset-password", "/change-password"]);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 9,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user: recipient, url }) => {
      await sendEmail({
        to: recipient.email,
        subject: "Reset your Brightloop password",
        text: `Hi ${recipient.name},\n\nUse this link to choose a new password. It works for one hour:\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
      });
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
    },
  },

  // Better Auth only checks length, so the spec's other password rules are enforced here on the server.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!PATHS_SETTING_A_PASSWORD.has(ctx.path)) return;
      const password = ctx.body?.password ?? ctx.body?.newPassword;
      const problem = typeof password === "string" ? passwordProblem(password) : "Enter a password.";
      if (problem) throw new APIError("BAD_REQUEST", { message: problem });
    }),
  },

  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await ensureCustomerRecord(db, {
            id: created.id,
            name: created.name,
            email: created.email,
            role: (created as { role?: string | null }).role,
          });
        },
      },
    },
  },
});

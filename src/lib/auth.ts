import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { after } from "next/server";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { ensureCustomerRecord } from "@/lib/accounts";
import { emailUnavailable, sendEmail } from "@/lib/email";
import { authRequestProblem } from "@/lib/password";

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

  // Emails send after the response, so response time can't reveal whether an address has an account.
  advanced: {
    backgroundTasks: { handler: (task) => after(task) },
  },

  // Better Auth only checks length, so the spec's other password rules are enforced here on the server.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/request-password-reset" && emailUnavailable()) {
        throw new APIError("SERVICE_UNAVAILABLE", { message: "Password reset email isn't available right now." });
      }
      const problem = authRequestProblem(ctx.path, ctx.body);
      if (problem) throw new APIError("BAD_REQUEST", { message: problem });
    }),
  },

  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          // The login already exists by now, so a failure here mustn't fail signup. requirePageRole repairs it.
          await ensureCustomerRecord(db, {
            id: created.id,
            name: created.name,
            email: created.email,
            role: (created as { role?: string | null }).role,
          }).catch((error) => console.error(`Customer record failed for user ${created.id}`, error));
        },
      },
    },
  },
});

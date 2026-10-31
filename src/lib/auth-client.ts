import { createAuthClient } from "better-auth/react";

// No base URL: calls go to whichever site the page is on, so local, preview and live all work.
export const authClient = createAuthClient();

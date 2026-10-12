import { createAuthClient } from "better-auth/react";

/** Cliente do Better Auth. Fala com `/api/auth` na mesma origem (proxy do Next). */
export const authClient = createAuthClient({ basePath: "/api/auth" });

export const { useSession, signOut } = authClient;

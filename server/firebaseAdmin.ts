import fs from "node:fs";
import path from "node:path";
import { getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

let cachedProjectId: string | null = null;

export function getFirebaseProjectId(): string | null {
  if (cachedProjectId) return cachedProjectId;

  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(configPath, "utf-8")
      ) as FirebaseAppletConfig;
      if (
        raw.projectId &&
        raw.projectId !== "remixed-project-id" &&
        raw.projectId.trim().length > 0
      ) {
        cachedProjectId = raw.projectId.trim();
        return cachedProjectId;
      }
    } catch {
      // Ignore malformed file and fall through to env
    }
  }

  const envId = (process.env.VITE_FIREBASE_PROJECT_ID ?? "").trim();
  if (envId && envId !== "remixed-project-id") {
    cachedProjectId = envId;
    return cachedProjectId;
  }

  return null;
}

function getOrInitAdminApp(): App | null {
  const projectId = getFirebaseProjectId();
  if (!projectId) return null;

  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp({ projectId });
}

export async function verifyBearerToken(
  authorizationHeader?: string
): Promise<DecodedIdToken | null> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token || token.length > 8192) {
    return null;
  }

  const app = getOrInitAdminApp();
  if (!app) {
    return null;
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import appletConfig from "../../firebase-applet-config.json";

interface RawFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

const hasValidAppletConfig = Boolean(
  appletConfig.projectId &&
  appletConfig.projectId !== "remixed-project-id" &&
  appletConfig.apiKey
);

const envConfig: RawFirebaseConfig = hasValidAppletConfig
  ? {
      apiKey: appletConfig.apiKey,
      authDomain: appletConfig.authDomain,
      projectId: appletConfig.projectId,
      appId: appletConfig.appId,
      storageBucket: appletConfig.storageBucket,
      messagingSenderId: appletConfig.messagingSenderId,
      firestoreDatabaseId: appletConfig.firestoreDatabaseId,
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
      appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      firestoreDatabaseId:
        import.meta.env.VITE_FIREBASE_DATABASE_ID || undefined,
    };

export const isFirebaseConfigured = Boolean(
  envConfig.projectId &&
  envConfig.projectId !== "remixed-project-id" &&
  envConfig.apiKey
);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(envConfig);
  dbInstance = envConfig.firestoreDatabaseId
    ? getFirestore(app, envConfig.firestoreDatabaseId)
    : getFirestore(app);
  authInstance = getAuth(app);
}

export const firebaseApp = app;
export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  offline: boolean;
  error?: string;
}> {
  if (!dbInstance) {
    return {
      connected: false,
      offline: false,
      error: "Firebase is not configured.",
    };
  }

  try {
    await getDocFromServer(doc(dbInstance, "test", "connection"));
    return { connected: true, offline: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const offline = msg.includes("the client is offline");
    if (offline) {
      console.error("Please check your Firebase configuration.");
    }
    return {
      connected: false,
      offline,
      error: msg,
    };
  }
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  auth,
  googleProvider,
  isFirebaseConfigured,
  testFirestoreConnection,
} from "./config";

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  firestoreConnected: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  firebaseEnabled: false,
  firestoreConnected: false,
  authError: null,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  getIdToken: async () => null,
});

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(!isFirebaseConfigured);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    testFirestoreConnection().then((res) => {
      setFirestoreConnected(res.connected);
    });

    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      setAuthError("Firebase Authentication is not configured.");
      return;
    }
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      if (msg.includes("popup-closed-by-user")) {
        return;
      }
      if (msg.includes("auth/unauthorized-domain")) {
        setAuthError(
          `Sign-in is not authorized for ${window.location.hostname}. Use the authorized Cloud Run preview URL or add this host under Firebase Authentication > Settings > Authorized domains.`
        );
        return;
      }
      if (msg.includes("auth/popup-blocked")) {
        setAuthError(
          "Sign-in popup was blocked by your browser. Please allow popups for this site and try again."
        );
        return;
      }
      setAuthError(msg);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    setAuthError(null);
    await signOut(auth);
  }, []);

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        firebaseEnabled: isFirebaseConfigured,
        firestoreConnected,
        authError,
        signInWithGoogle,
        signOutUser,
        getIdToken,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase() {
  return useContext(FirebaseContext);
}

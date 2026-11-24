import { auth } from "./config";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface SanitizedFirestoreErrorInfo {
  code: string;
  error: string;
  operationType: OperationType;
  path: string | null;
  authState: {
    authenticated: boolean;
    emailVerified: boolean | null;
    providerIds: string[];
  };
}

export function sanitizeOperationalText(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/Bearer\s+[0-9A-Za-z._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 300);
}

export function sanitizeFirestorePath(path: string | null): string | null {
  if (!path) return null;
  const segments = path.split("/");
  const redacted = segments.map((seg, idx) => {
    const prev = idx > 0 ? segments[idx - 1] : "";
    if (prev === "users" || prev === "confirmations" || prev === "admins") {
      return "[REDACTED_UID]";
    }
    return seg;
  });
  return redacted.join("/");
}

function extractFirebaseErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
  }
  return "firestore-error";
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth?.currentUser ?? null;
  const rawMessage = error instanceof Error ? error.message : String(error);

  const errInfo: SanitizedFirestoreErrorInfo = {
    code: extractFirebaseErrorCode(error),
    error: sanitizeOperationalText(rawMessage),
    operationType,
    path: sanitizeFirestorePath(path),
    authState: {
      authenticated: Boolean(currentUser),
      emailVerified: currentUser ? currentUser.emailVerified : null,
      providerIds:
        currentUser?.providerData
          ?.map((provider) => provider.providerId)
          .filter((id): id is string => Boolean(id)) ?? [],
    },
  };

  const serialized = JSON.stringify(errInfo);
  console.error("Firestore operational error:", serialized);
  throw new Error(serialized);
}

import { Request, Response, NextFunction } from "express";
import { getSession, getUserById, pruneExpiredSessions, UserRecord, UserRole } from "./auth.js";

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
  sessionId?: string;
}

export function attachUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  pruneExpiredSessions();
  const sessionId = req.cookies?.session_id as string | undefined;
  if (!sessionId) {
    return next();
  }
  const session = getSession(sessionId);
  if (!session) {
    return next();
  }
  const expiresAt = new Date(session.expiresAt);
  if (expiresAt.getTime() < Date.now()) {
    return next();
  }
  const user = getUserById(session.userId);
  req.user = user;
  req.sessionId = sessionId;
  return next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
}

export function requireRole(roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

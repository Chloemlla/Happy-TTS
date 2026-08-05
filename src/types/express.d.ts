import type { IUser } from "../models/lumen/User";
import type { ISession } from "../models/lumen/Session";
import type { IAdminSession } from "../models/lumen/AdminSession";

declare global {
  namespace Express {
    interface Request {
      lumenUserId?: string;
      lumenSession?: ISession;
      lumenAdminOperator?: string;
      lumenAdminRole?: string;
      lumenAdminUsername?: string;
      lumenAdminCreatedAt?: number;
      lumenSecurityEvidence?: {
        status: string;
        verified: boolean;
        completed: boolean;
        rooted: boolean;
        suspicious: boolean;
        hardwareIntegrityOk: boolean;
        selinuxEnforcing: boolean;
        teeAttestationOk: boolean;
        observedAt: number;
        scannerVersion: string;
      };
    }
  }
}
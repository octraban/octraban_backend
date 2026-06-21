import { NetworkName, NetworkProfile } from '../profiles';
import { Role, Tier } from '../auth/rbac';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      network: NetworkName;
      networkProfile: NetworkProfile;
      coldStorage?: {
        enabled: boolean;
        type: string;
        path?: string;
        ledgerSeq: number;
      };
      user?: {
        id: string;
        address: string;
        role: Role;
        tier: Tier;
        sessionId: string;
        appId: string;
      };
    }
  }
}

import type { Request, RequestHandler, Response } from "express";
import type { AppSettings, Customer, DashboardPayload } from "./domain.js";
import type { AppStore } from "./store-contract.js";
import type { AuthenticatedAppSession } from "./supabase.js";

export type ActiveOrganizationSession = AuthenticatedAppSession & {
  activeOrganizationId: string;
  activeOrganizationName: string;
  activeOrganizationRole: NonNullable<AuthenticatedAppSession["activeOrganizationRole"]>;
};

export type RequestStoreGetter = (res: Response, fallbackStore?: AppStore | null) => AppStore;
export type LoggingStoreGetter = (res: Response, fallbackStore?: AppStore | null) => AppStore | null;
export type RequireAuthContext = (res: Response) => AuthenticatedAppSession;
export type RequirePlatformAdmin = (res: Response) => AuthenticatedAppSession;
export type RequireOrganizationAdmin = (res: Response) => ActiveOrganizationSession;
export type RequireOrganizationOwner = (res: Response) => ActiveOrganizationSession;
export type RequireWorkspaceEditor = (res: Response) => ActiveOrganizationSession;
export type RequireInternalJobAccess = (req: Request, res: Response) => "secret" | "ops";
export type RequireRenewalAgentAccess = (req: Request) => void;
export type ServerManagedSettingsGetter = (store: AppStore) => Promise<AppSettings>;
export type CustomerToClient = (customer: Customer) => Customer;
export type SettingsToClient<TClientSettings> = (
  settings: AppSettings,
  options?: { role?: AuthenticatedAppSession["activeOrganizationRole"] }
) => TClientSettings;
export type CreateEmptyBootstrapWorkspace = () => Omit<DashboardPayload, "logs" | "renewalAutomation">;
export type CreateEmptySettings = () => AppSettings;
export type AppRateLimiter = RequestHandler;

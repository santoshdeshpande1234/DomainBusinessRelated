import type { Role } from "./options";

export type Perm = "campaign:write" | "campaign:delete" | "workspace:write" | "team:manage" | "integration:write" | "audit:read";

const PERMS: Record<Role, Perm[]> = {
  admin: ["campaign:write", "campaign:delete", "workspace:write", "team:manage", "integration:write", "audit:read"],
  member: ["campaign:write"],
  viewer: [],
};

export function can(role: Role | null | undefined, perm: Perm): boolean {
  return !!role && PERMS[role].includes(perm);
}

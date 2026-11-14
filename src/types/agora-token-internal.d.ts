// Test-only reference: Agora's AccessToken2 internals (dev dependency "agora-token").
declare module "agora-token/src/AccessToken2" {
  export class AccessToken2 {
    constructor(appId?: string, appCertificate?: string, issueTs?: number, expire?: number);
    salt: number;
    add_service(s: unknown): void;
    build(): string;
    from_string(t: string): boolean;
  }
  export class ServiceRtc {
    constructor(channel: string, uid: number);
    add_privilege(p: number, expire: number): void;
  }
}

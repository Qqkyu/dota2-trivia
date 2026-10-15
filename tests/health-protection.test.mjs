import { afterEach, expect, it, vi } from "vitest";

const { health } = vi.hoisted(() => ({ health: vi.fn(async () => ({ backend: "postgres", ok: true })) }));
vi.mock("../src/lib/account-store", () => ({
  getAccountStoreHealth: health,
  getUserBySession: vi.fn(),
  createAccountSession: vi.fn(),
  deleteAccountSession: vi.fn(),
}));
vi.mock("../src/lib/vote-store", () => ({ getVoteStoreHealth: health }));
vi.mock("../src/lib/alpha-store", () => ({ getAlphaStoreHealth: health }));
vi.mock("../src/lib/store-maintenance", () => ({
  getStoreMaintenanceStatus: () => ({ lastAttemptAt: 1, lastSucceededAt: 1, lastFailedAt: null }),
}));
vi.mock("../src/lib/game-catalogs", () => ({
  DEFAULT_GAME_ID: "dota2",
  GAME_CATALOGS: { dota2: { id: "dota2", contentVersion: "test", questions: [] } },
}));
vi.mock("../src/lib/question-review", () => ({
  configuredReviewerSteamIds: () => [],
  invalidReviewerSteamIds: () => [],
}));
import { GET } from "../src/app/api/health/route.ts";

afterEach(() => vi.unstubAllEnvs());

it("limits public health probes before expensive store readiness checks", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ARCADE_APP_URL", "http://localhost");
  vi.stubEnv("ARCADE_AUTH_SECRET", "health-test-auth-secret-at-least-32-characters");
  vi.stubEnv("ARCADE_VOTER_SALT", "health-test-voter-salt-at-least-32-characters");
  vi.stubEnv("ARCADE_DATA_COUNTRIES", "local verification");
  vi.stubEnv("ARCADE_REVIEWER_STEAM_IDS", "");
  vi.stubEnv("ARCADE_TRUST_PROXY", "x-real-ip");
  vi.stubEnv("DATABASE_URL", "postgres://fixture.invalid/fixture");
  const request = () => new Request("http://localhost/api/health", { headers: { "x-real-ip": "192.0.2.88" } });
  for (let index = 0; index < 120; index++) expect((await GET(request())).status).toBe(200);
  const limited = await GET(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).not.toBeNull();
  expect(health).toHaveBeenCalledTimes(360);
  const other = await GET(new Request("http://localhost/api/health", { headers: { "x-real-ip": "192.0.2.89" } }));
  expect(other.status).toBe(200);
  expect(health).toHaveBeenCalledTimes(363);
});

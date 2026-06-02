import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load the repo-root .env regardless of the process cwd (npm runs this in
// the server workspace dir; the .env lives one level up). On Vercel there is
// no .env file and platform env vars are used instead — dotenv just no-ops.
const here = path.dirname(fileURLToPath(import.meta.url)); // server/src
const repoRoot = path.resolve(here, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const useMocksEnv = (process.env.USE_MOCKS ?? "true").toLowerCase() !== "false";
const llmConfigured = Boolean(process.env.LLM_API_KEY);
const placesConfigured = Boolean(process.env.GOOGLE_PLACES_API_KEY);
const routingConfigured = Boolean(process.env.ORS_API_KEY);
const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export const config = {
  port: Number(process.env.PORT ?? 3001),
  useMocks: useMocksEnv,
  llmConfigured,
  placesConfigured,
  routingConfigured,
  blobConfigured,
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "",
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  orsApiKey: process.env.ORS_API_KEY ?? "",
  storageBackend: (blobConfigured ? "vercel-blob" : "json-file") as
    | "vercel-blob"
    | "json-file",
};

/** True when the route planner will serve mock plans (forced, or no LLM key). */
export const llmMockMode = useMocksEnv || !llmConfigured;

/** True when place search will serve mock places (forced, or no Places key). */
export const placesMockMode = useMocksEnv || !placesConfigured;

/** Headline mock flag shown in the UI banner. */
export const mockMode = llmMockMode;

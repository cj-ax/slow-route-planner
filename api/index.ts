// Vercel serverless entry. The whole Express app is exported as the default
// handler; vercel.json rewrites every /api/* request to this function.
// Locally you don't use this file — `npm run dev` runs server/src/index.ts
// as a normal Express server.
import app from "../server/src/app.js";

export default app;

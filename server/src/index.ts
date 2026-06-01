import app from "./app";
import { config } from "./config";

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  console.log(
    `[server] mocks=${config.useMocks} llm=${config.llmConfigured} places=${config.placesConfigured} storage=${config.storageBackend}`,
  );
});

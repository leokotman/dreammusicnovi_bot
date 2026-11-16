import { readConfig } from "../delivery/config";
import { runtimeService } from "../delivery/runtime";
import { CandidateClient } from "./client";
import { candidateUrl, pairingEnabled } from "./config";
import { pairingMiddleware } from "./handlers";
import { PairingService } from "./service";

export const websitePairing = pairingMiddleware({
  enabled: pairingEnabled,
  deliveryEnabled: () => process.env.WEBSITE_DELIVERY_ENABLED === "true",
  botId: () => readConfig(process.env).botToken.split(":")[0],
  consent: () => runtimeService(readConfig(process.env)).consent,
  pairing: () => {
    const config = readConfig(process.env);
    return new PairingService(runtimeService(config).consent,
      new CandidateClient(candidateUrl(process.env.WEBSITE_PAIRING_CANDIDATE_URL), config.apiSecrets[0], config.botToken.split(":")[0]),
      config.botToken);
  },
});

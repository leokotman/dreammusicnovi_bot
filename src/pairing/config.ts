/** New pairing controls stay unavailable until both runtimes support the contract. */
export function pairingEnabled(): boolean {
  return process.env.WEBSITE_PAIRING_ENABLED === "true" && process.env.WEBSITE_DELIVERY_ENABLED === "true";
}

/** One fixed HTTPS destination; never follow redirects carrying service credentials. */
export function candidateUrl(value: string | undefined): string {
  if (!value) throw new Error("pairing-unconfigured");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
      url.pathname !== "/api/telegram/connection/candidate") throw new Error("pairing-unconfigured");
  return url.href;
}

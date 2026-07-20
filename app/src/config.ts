import Constants from "expo-constants";

// In a development build the JS bundle is served from the dev machine by
// Metro, and Constants.expoConfig.hostUri is "<dev-machine-ip>:8081". That
// same machine runs Asterisk, so its IP is exactly the SIP server address —
// and it tracks DHCP/hotspot/WiFi changes automatically, no manual editing.
// In a production build hostUri is undefined and the fallback is used; when
// the server gets a real home, replace the fallback with its DNS name (e.g.
// "voip.legonline.example") rather than an IP.
const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
const host = devHost ?? "10.140.37.171";

export const SIP_CONFIG = {
  wssUrl: `ws://${host}:8088/ws`,
  domain: host,
};

// Push-gateway (Phase 2) — same machine as Asterisk in dev. Host port 3010
// maps to the gateway container's 3000 (see server/docker-compose.yml).
export const GATEWAY_URL = `http://${host}:3010`;

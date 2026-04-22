import Ably from "ably";

export function createAblyRealtime(clientId: string, tokenUrl = "/api/ably/token") {
  return new Ably.Realtime({
    authUrl: tokenUrl,
    authMethod: "POST",
    authParams: { clientId },
    clientId,
    echoMessages: false,
  });
}

export function createAblyRest() {
  return new Ably.Rest({ key: process.env.ABLY_API_KEY! });
}

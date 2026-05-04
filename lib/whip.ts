/**
 * Tiny WHIP (WebRTC-HTTP Ingestion Protocol, RFC 9725) client.
 *
 * Used by the browser broadcaster to push a screen-share + audio MediaStream
 * into Livepeer. Livepeer transcodes it and the existing HLS playback URL
 * (built via `playbackUrl(playbackId)`) lets viewers watch as before.
 */

export type WhipSession = {
  /** Underlying peer connection — exposed so callers can attach state listeners. */
  pc: RTCPeerConnection;
  /** WHIP resource URL returned in the Location header. DELETE this to end the broadcast. */
  resourceUrl: string;
  /** Stop tracks, close PC, and DELETE the WHIP resource. Idempotent. */
  close: () => Promise<void>;
};

const ICE_GATHERING_TIMEOUT_MS = 3000;

/**
 * Publish a MediaStream to a WHIP endpoint.
 *
 * @param ingestUrl Endpoint like `https://webrtc.livepeer.studio/webrtc/<stream-key>`
 * @param stream    Outgoing media. All tracks are added as `sendonly` transceivers.
 */
export async function publishWhip(
  ingestUrl: string,
  stream: MediaStream,
): Promise<WhipSession> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    bundlePolicy: "max-bundle",
  });

  for (const track of stream.getTracks()) {
    pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const offerSdp = pc.localDescription?.sdp;
  if (!offerSdp) {
    pc.close();
    throw new Error("Failed to generate local SDP offer");
  }

  let res: Response;
  try {
    res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offerSdp,
    });
  } catch (err) {
    pc.close();
    throw new Error(
      `WHIP request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    pc.close();
    throw new Error(`WHIP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
  }

  const answerSdp = await res.text();
  if (!answerSdp.trim()) {
    pc.close();
    throw new Error("WHIP server returned an empty SDP answer");
  }

  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  // The `Location` header carries the resource URL we DELETE on stop. It may
  // be relative — resolve it against the (possibly redirected) response URL.
  const locHeader = res.headers.get("Location") ?? res.headers.get("location");
  const resourceUrl = locHeader
    ? new URL(locHeader, res.url || ingestUrl).toString()
    : res.url || ingestUrl;

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await fetch(resourceUrl, { method: "DELETE" });
    } catch {
      // Best-effort: server may have already torn down the session.
    }
    for (const sender of pc.getSenders()) {
      try {
        sender.track?.stop();
      } catch {
        // Track may already be stopped.
      }
    }
    try {
      pc.close();
    } catch {
      // No-op.
    }
  };

  return { pc, resourceUrl, close };
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);
    function check() {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

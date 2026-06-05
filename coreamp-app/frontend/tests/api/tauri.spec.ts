import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { nativeAudioStatus, nativeAudioPause, TauriError } from "@/api/tauri";

describe("api/tauri", () => {
  beforeEach(() => invokeMock.mockReset());

  it("nativeAudioStatus returns the typed status from invoke", async () => {
    invokeMock.mockResolvedValue({
      available: true,
      active: true,
      paused: false,
      finished: false,
      current_path: "/m/a.mp3",
      detail: null,
    });
    const status = await nativeAudioStatus();
    expect(invokeMock).toHaveBeenCalledWith("native_audio_status");
    expect(status.active).toBe(true);
  });

  it("nativeAudioPause throws a TauriError carrying the command on failure", async () => {
    // mockImplementationOnce (not mockRejectedValue) so the rejected promise is
    // created lazily on the call and fully consumed by call()'s catch — avoids a
    // dangling unhandled rejection that vitest would flag.
    invokeMock.mockImplementationOnce(() => Promise.reject("device gone"));
    const err = await nativeAudioPause().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TauriError);
    expect((err as TauriError).command).toBe("native_audio_pause");
    expect((err as TauriError).message).toBe("device gone");
  });
});

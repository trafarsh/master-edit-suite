import { describe, expect, it } from "vitest";
import { buildScript, parseEnvelope } from "../../src/panel/bridge/host";
import { createHost } from "../host/aeMock";

describe("host bridge", () => {
  it("builds scripts the real host can evaluate, whatever the argument text", () => {
    const h = createHost();
    h.comp();
    const tricky = { path: 'C:\\Users\\Ana "Ed"\\Vidéos\\ü\'s\n編集.png', n: [1, 2.5, -3] };
    const raw = h.evalScript(buildScript("host.ping", tricky));
    const env = parseEnvelope<{ hostVersion: string }>(raw, "host.ping");
    expect(env.ok).toBe(true);

    // Echo through an action that returns its argument verbatim.
    h.evalScript(`MES.register("test.echo", { fn: function (a) { return a; } })`);
    const echoed = parseEnvelope<typeof tricky>(h.evalScript(buildScript("test.echo", tricky)), "test.echo");
    expect(echoed.ok && echoed.result).toEqual(tricky);
  });

  it("turns a silent host into an actionable error", () => {
    const env = parseEnvelope("EvalScript error.", "state.get");
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.error.code).toBe("no_host");
  });

  it("reports unreadable answers instead of throwing", () => {
    const env = parseEnvelope("{oops", "state.get");
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.error.code).toBe("bad_envelope");
  });
});

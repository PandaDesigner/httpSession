import { describe, expect, it, vi } from "vitest";
import { HttpRequest, NetworkError } from "../../src";

describe("HttpRequest lifecycle", () => {
  it("notifies idle, pending, and success snapshots", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "success",
      data: 7,
      response: { status: 200, statusText: "OK", headers: new Headers() },
    });
    const request = new HttpRequest(execute);
    const states: string[] = [];

    request.subscribe(snapshot => states.push(snapshot.state));
    await request.start();

    expect(states).toEqual(["idle", "pending", "success"]);
  });

  it("returns the same in-flight promise when started twice", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "failure",
      error: new NetworkError("failed"),
    });
    const request = new HttpRequest(execute);
    expect(request.start()).toBe(request.start());
  });

  it("settles cancellation as a cancelled failure snapshot", async () => {
    const request = new HttpRequest<number>(() => new Promise(() => {}));
    const snapshots: string[] = [];
    request.subscribe(snapshot => snapshots.push(snapshot.state));

    const completion = request.start();
    await Promise.resolve();
    request.cancel();

    await expect(completion).resolves.toMatchObject({
      status: "failure",
      error: { code: "CANCELLED" },
    });
    expect(snapshots).toEqual(["idle", "pending", "cancelled"]);
  });

  it("settles when a pending notification cancels the request", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "success" as const,
      data: 7,
      response: { status: 200, statusText: "OK", headers: new Headers() },
    });
    const request = new HttpRequest(execute);
    request.subscribe(snapshot => {
      if (snapshot.state === "pending") request.cancel();
    });

    await expect(request.start()).resolves.toMatchObject({
      status: "failure",
      error: { code: "CANCELLED" },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  atomicJson,
  compilerLog,
  processGroup,
  supervisorIdentity,
  supervisorPath,
  supervisorResult,
  type SupervisorResult,
} from "./supervision";

/** A trusted local tool shares the compiler's independently owned process group.
 * No process id read from disk is ever a signal target. This handle owns only
 * its newly launched IPC child; the worker handles parent loss and escalation.
 */
export class LocalProcess {
  readonly done: Promise<{ result: SupervisorResult | null; log: string }>;
  private child: ChildProcess;
  private timer?: ReturnType<typeof setInterval>;
  private resolve!: (value: {
    result: SupervisorResult | null;
    log: string;
  }) => void;
  private finished = false;
  constructor(
    private dir: string,
    request: {
      command: string;
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeoutMs: number;
    },
  ) {
    this.done = new Promise((resolve) => {
      this.resolve = resolve;
    });
    const token = randomUUID();
    this.child = spawn(process.execPath, [supervisorPath, dir, token], {
      cwd: request.cwd,
      env: request.env,
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const inspect = () => this.inspect();
    this.child.on("error", inspect);
    this.child.on("exit", inspect);
    this.child.on("close", inspect);
    if (this.child.pid) {
      try {
        atomicJson(path.join(dir, "supervisor.json"), {
          version: 1,
          pid: this.child.pid,
          token,
        });
        this.child.send({ type: "start", token, ...request }, (error) => {
          if (error && this.child.connected) this.child.disconnect();
        });
      } catch {
        if (this.child.connected) this.child.disconnect();
      }
    }
    // Poll only after the IPC owner reports exit/error; a running PID is never
    // mistaken for a terminal response or permission to launch a replacement.
  }
  cancel() {
    if (this.child.connected)
      this.child.send({ type: "cancel" }, (error) => {
        if (error && this.child.connected) this.child.disconnect();
      });
  }
  private inspect() {
    if (this.finished) return;
    const identity = supervisorIdentity(this.dir),
      members = identity ? processGroup(identity.pid) : [];
    if (members === null || members.length) {
      if (!this.timer) {
        this.timer = setInterval(() => this.inspect(), 75);
        this.timer.unref();
      }
      return;
    }
    this.finished = true;
    clearInterval(this.timer);
    this.resolve({
      result: identity ? supervisorResult(this.dir, identity) : null,
      log:
        compilerLog(this.dir) ?? "Could not start the local tool supervisor.",
    });
  }
}

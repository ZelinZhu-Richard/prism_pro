"""Verify the real CLI prompt with synthetic keys in an isolated PTY (macOS/Linux)."""
from pathlib import Path
import os
import pty
import select
import shutil
import subprocess
import tempfile
import time

app = Path(__file__).resolve().parent.parent
evidence = app / "data" / "verification"
evidence.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="cli-pty-", dir=evidence) as directory:
    root = Path(directory)
    for name in ("scripts/keys.ts", "server/key-file.ts", "server/provider-config.ts", "shared/types.ts"):
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(app / name, target)
    (root / "package.json").write_text('{"type":"module"}')
    (root / "node_modules").symlink_to(app / "node_modules", target_is_directory=True)

    def prompt(value):
        master, slave = pty.openpty()
        child = subprocess.Popen(
            ["node", "--import", "tsx", "scripts/keys.ts", "set", "gemini"],
            cwd=root, stdin=slave, stdout=slave, stderr=slave,
        )
        os.close(slave)
        output, sent = b"", False
        try:
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.1)[0]:
                    try:
                        data = os.read(master, 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    output += data
                    if not sent and b"API key (hidden): " in output:
                        os.write(master, value)
                        sent = True
                if child.poll() is not None:
                    break
            return child.wait(timeout=2), output
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)

    status, output = prompt(b"hidden-fixture-value\r")
    assert status == 0 and b"hidden-fixture-value" not in output
    before = (root / ".env").read_text()
    assert "hidden-fixture-value" in before
    status, output = prompt(b"cancelled-secret\x03")
    assert status == 1 and b"cancelled-secret" not in output
    assert (root / ".env").read_text() == before

print("Hidden CLI prompt: no key echo; save and Ctrl-C cancellation passed.")

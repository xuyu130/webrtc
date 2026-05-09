#!/usr/bin/env python3
"""Development runner: watch project files and restart `app.py` on changes.

Usage:
  python dev_run.py

It respects `HOST` and `PORT` environment variables (forwarded to child process).
Requires: `watchdog` (added to requirements.txt).
"""
import os
import sys
import time
import subprocess
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

WATCH_EXTENSIONS = ('.py', '.html', '.js', '.css', '.md')


class RestartHandler(FileSystemEventHandler):
    def __init__(self, restart_callback, debounce=0.5):
        super().__init__()
        self.restart_callback = restart_callback
        self.debounce = debounce
        self._last = 0

    def on_any_event(self, event):
        if event.is_directory:
            return
        if not event.src_path.lower().endswith(WATCH_EXTENSIONS):
            return
        now = time.time()
        if now - self._last < self.debounce:
            return
        self._last = now
        print(f"[dev_run] Detected change: {event.src_path}")
        self.restart_callback()


def run_server(cmd):
    env = os.environ.copy()
    return subprocess.Popen(cmd, env=env)


def main():
    cmd = [sys.executable, 'app.py']
    proc = None

    def start():
        nonlocal proc
        if proc and proc.poll() is None:
            return
        print('[dev_run] Starting app.py')
        proc = run_server(cmd)

    def stop():
        nonlocal proc
        if proc and proc.poll() is None:
            print('[dev_run] Stopping app.py')
            proc.terminate()
            try:
                proc.wait(3)
            except Exception:
                proc.kill()
        proc = None

    def restart():
        stop()
        start()

    start()

    event_handler = RestartHandler(restart)
    observer = Observer()
    observer.schedule(event_handler, path='.', recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
            if proc and proc.poll() is not None:
                print('[dev_run] app.py exited unexpectedly; restarting')
                start()
    except KeyboardInterrupt:
        print('\n[dev_run] Keyboard interrupt: stopping')
    finally:
        observer.stop()
        observer.join()
        stop()


if __name__ == '__main__':
    main()

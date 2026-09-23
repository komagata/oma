#!/usr/bin/env python3
"""Run outside O.M.A.'s process group. Never stop the desktop shell."""
import json
import subprocess
import time

PLUGIN = 'io.github.komagata.oma'
def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=15).strip()

def restart(run=run, sleep=time.sleep):
    run('omarchy-shell', 'shell', 'ping')
    try:
        run('omarchy', 'plugin', 'disable', PLUGIN)
        sleep(.4)
    except subprocess.SubprocessError:
        pass  # Recovery must continue even when disable loses its IPC reply.
    finally:
        # Even if disable's reply fails, always attempt to bring O.M.A. back.
        last = None
        for _ in range(3):
            try:
                run('omarchy', 'plugin', 'enable', PLUGIN)
                last = None
                break
            except subprocess.SubprocessError as error:
                last = error
                sleep(.5)
        if last:
            raise last
    for _ in range(40):
        try:
            status = json.loads(run('omarchy-shell', PLUGIN, 'status'))
            if status.get('state') in ('idle', 'unauthenticated', 'error'):
                run('omarchy-shell', PLUGIN, 'open')
                sleep(.5)
                reopened = json.loads(run('omarchy-shell', PLUGIN, 'status'))
                if reopened.get('panelOpened') is True:
                    return
        except (subprocess.SubprocessError, ValueError):
            pass
        sleep(.25)
    raise RuntimeError('O.M.A. did not become ready; the desktop bar was left running.')

if __name__ == '__main__':
    restart()

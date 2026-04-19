"""Sync YAML task statuses into body-level markdown checkboxes.

The frontmatter's `status` field is authoritative. This module rewrites `[ ]`
and `[x]` markers in the body to match. Tasks whose id does not appear in the
body are silently skipped; checkbox lines that do not match any spec id are
left untouched (so users can add manual checklist items).
"""

from __future__ import annotations

import re

from phase_runner.schema import PhaseSpec

LINE_RE = re.compile(
    r"""^
        (?P<pre>\s*-\s+\[)                # "- [" with optional indent
        (?P<bracket>[ xX])                # current marker
        (?P<mid>\]\s+(?:\*\*)?)           # "] " optionally followed by **
        (?P<id>[A-Za-z0-9_-]+)            # task id (greedy, full word)
        (?:\*\*)?                         # optional closing **
        (?=[\s:]|$)                       # must end at whitespace, colon, or EOL
    """,
    re.VERBOSE,
)


def sync_checkboxes(body: str, spec: PhaseSpec) -> str:
    tasks = {t.id: t for wave in spec.waves for t in wave.tasks}
    out: list[str] = []
    for line in body.splitlines(keepends=True):
        m = LINE_RE.match(line)
        if m is None or m.group("id") not in tasks:
            out.append(line)
            continue
        target = "x" if tasks[m.group("id")].status == "done" else " "
        start, end = m.start("bracket"), m.end("bracket")
        out.append(line[:start] + target + line[end:])
    return "".join(out)

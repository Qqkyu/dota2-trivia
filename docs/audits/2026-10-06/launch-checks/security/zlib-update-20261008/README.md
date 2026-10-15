# Container compression-library update

The complete Trivy scan of candidate `c8729a2b11b5723f99375e53cabc8fde6fd5fa31`
found one fixable Alpine package issue. It identified `CVE-2026-85091` in
`zlib 1.3.2-r0` and listed `1.3.2-r1` as fixed. The scanned image was
`sha256:a2d7d25271286e6f28d4c9209058ccc87918a9a5675fce619cec6986bc28d3ad`.
The scan included every severity and unfixed findings. Trivy classified this finding
as medium, so the configured high/critical CI gate had passed.

Alpine's [package recipe](https://github.com/alpinelinux/aports/blob/3.24-stable/main/zlib/APKBUILD)
records the fix in `1.3.2-r1`. It includes the upstream correction for a buffer
overflow during non-blocking compressed writes. The saved [patch](CVE-2026-85091.patch.txt)
matches the SHA-512 in the saved [package recipe](APKBUILD.txt). The
[source record](sources.json) binds both downloads by SHA-256.

The Docker runtime now requires `zlib>=1.3.2-r1` when installing ffmpeg. This makes
the build fail if a mirror cannot supply the fixed package. Other runtime settings
and the pinned Node base image stay unchanged.

The CI image gate now also rejects fixable medium findings. This would reject the
zlib result that passed the earlier high/critical gate. The complete release scan
still includes all severities and unfixed findings for review.

Acceptance requires a new image with the fixed package, a complete vulnerability
scan, and the actual container and browser checks. Those results will be recorded
in the [CI report](../../ci/README.md). The earlier image was not deployed.

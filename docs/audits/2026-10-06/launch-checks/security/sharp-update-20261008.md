# Image dependency security update

The fresh dependency audit on 8 October found one high-severity advisory in Sharp 0.35.4.
GitHub added the advisory to its reviewed database on 6 October, after the earlier clean
launch scan. The earlier result remains valid for its recorded time and is preserved.

The [maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
identifies a memory-safety defect in the bundled SVG library. Its code-execution impact
depends on runtime conditions on glibc Linux. The supported fix is Sharp 0.35.5 with
librsvg 2.63.2. The container uses Alpine, but development and CI also use glibc systems,
so the release uses the patched library on all platforms.

Both the direct dependency and the override now pin Sharp 0.35.5. The lockfile changes
are confined to Sharp and its native packages. The installed runtime reports Sharp
0.35.5, librsvg 2.63.2 and libvips 8.18.7. The [repeat full dependency audit](dependency-audit-20261008.json)
has zero advisories. The [before and after record](sharp-update-20261008.json) binds the
package and lockfile hashes.

The old candidate's queued CI run was cancelled before release. The updated revision
requires a fresh image build and scan, plus the native image and browser checks in CI.
The [local verification report](../verification/2026-10-08/README.md) records the native
image regression results and full test suite for the updated dependency.

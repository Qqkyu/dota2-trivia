# Bundled zlib reachability review

Checked on 2026-10-10. This report replaces the unpublished October 8 draft.

No call to the affected gzip file-writing API was found in the reviewed application code or Sharp binding. The traced Node compression and PNG paths use `deflate` or `inflate`. This is a source review of those paths. It does not establish that the final image contains no affected code, or that every native library path is safe.

## Defect and scope

The upstream correction for CVE-2026-85091 changes `gz_write` after a failed non-blocking write. It resets the pending input count and pointer before the retry return. The patch changes `gzwrite.c`, not `deflate` or `inflate`. The fresh download has the same SHA-256 as the saved October 8 patch. [Upstream correction](https://github.com/madler/zlib/commit/df84af25dc1942490e1d1c899a07619152a46148), [saved Alpine review](zlib-update-20261008/README.md).

The expected result was a trace from the app's image and Node compression entry points to the relevant native API, with an explicit distinction between installed libraries and the final image. I searched source files, read the callers and their upstream implementations, checked package metadata, and inspected the native library's declared shared dependencies. I did not run an exploit or change a dependency.

## Reviewed paths

The round image endpoint takes the image source from the active question catalog. It passes that source to `cachedRoundImage`. The cache loads the bytes into Sharp and uses `.png().toBuffer()`. Installed Sharp 0.35.5 loads this buffer with `VImage::new_from_buffer` and writes the result through `pngsave_buffer`. The installed Next 16.3.8 image optimizer also passes bytes to Sharp and requests a buffer result. Its PNG output uses the same Sharp writer. [Round endpoint](../../../../../src/app/api/round-image/route.ts), [round image cache](../../../../../src/lib/round-image-cache.mjs).

In libvips 8.18.7, `pngsave_buffer` creates a memory target. Its writer gives libpng a target callback. libpng 1.6.58 compresses PNG image data with `deflate` and reads compressed PNG data with `inflate`. No gzip file handle is created in this traced PNG path. This review does not trace every other image format or native loader. [libvips buffer target](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/pngsave.c#L420), [libvips PNG writer](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/vipspng.c#L936), [libpng writer](https://github.com/pnggroup/libpng/blob/v1.6.58/pngwutil.c#L982), [libpng reader](https://github.com/pnggroup/libpng/blob/v1.6.58/pngrutil.c#L538).

Node v22.23.3's JavaScript zlib API creates its native binding. That binding uses `deflate` for gzip output and `inflate` for input. Neither binding source file calls `gzwrite` or `gzprintf`. This supports a conclusion about the Node JavaScript compression API. It does not prove those functions are absent from the executable. Node's zlib build list includes `gzwrite.c`, and its static-library build recipe imports that list. Other native callers are outside this review. [JavaScript binding](https://github.com/nodejs/node/blob/v22.23.3/lib/zlib.js), [native binding](https://github.com/nodejs/node/blob/v22.23.3/src/node_zlib.cc#L1016), [native source list](https://github.com/nodejs/node/blob/v22.23.3/deps/zlib/BUILD.gn#L311), [build recipe](https://github.com/nodejs/node/blob/v22.23.3/deps/zlib/zlib.gyp#L179).

The repeatable local search was:

```sh
rg -n '\bgz(write|printf|vprintf|fwrite|dopen|open)\b' src scripts node_modules/sharp/src
```

It returned exit code 1, no matches, and no error output. The same search found no matches in the two Node binding files or the four libvips and libpng files linked above. Search alone would not prove reachability; the caller review supplies the path-specific evidence.

## Packaging and zlib-ng

The local official Node v22.23.3 executable reported `process.versions.zlib` as `1.3.1-e00f703`. This is the local glibc executable, not proof of the Alpine executable's linked version. The older container metadata records Node v22.23.3 but omits `process.versions.zlib`. It also predates the Sharp update and reports Sharp 0.35.4. Do not use it as evidence for the current Sharp binary. [Earlier metadata](../infrastructure/final-native-metadata.json).

The installed musl package `@img/sharp-libvips-linuxmusl-x64` 1.3.4 reports libvips 8.18.7, libpng 1.6.58, and zlib-ng 2.3.3. The matching upstream recipe selects zlib-ng 2.3.3 and builds it with shared libraries disabled and zlib compatibility enabled. `readelf -d` on the installed musl `libvips-cpp.so.8.18.7` lists only `libstdc++.so.6`, `libgcc_s.so.1`, and `libc.musl-x86_64.so.1` as shared dependencies. Alpine's `libz` update therefore does not replace this bundled compression library. These checks do not prove the binary's complete source and build history. [Version list](https://github.com/lovell/sharp-libvips/blob/v1.3.4/versions.properties), [static build recipe](https://github.com/lovell/sharp-libvips/blob/v1.3.4/build/posix.sh#L129).

The zlib-ng 2.3.3 writer does not have the upstream `state->again` retry path. It records write errors as `Z_ERRNO`, and an immediate `gzvprintf` rejects a stored error. However, its error return still leaves the pending input pointer and count. Its public `gzclearerr` clears the error without resetting those fields. This report therefore makes no claim about a caller that clears the error and then continues writing. That sequence needs separate analysis. [zlib-ng writer](https://github.com/zlib-ng/zlib-ng/blob/2.3.3/gzwrite.c#L340), [error clearing](https://github.com/zlib-ng/zlib-ng/blob/2.3.3/gzlib.c#L534).

## Final image limit

At the time of this source review, the refreshed candidate image and its native metadata were still being built. The CI owner was asked to capture its exact image ID, Node version, `process.versions.zlib`, Sharp versions, and musl libvips hash. A final image scan and proof that Alpine installed `zlib>=1.3.2-r1` remain separate checks. This report does not grant a scanner exception or replace those checks. It does not establish a complete native call graph, rebuild native dependencies, or trace a live candidate process.

## Checked hashes

These SHA-256 values bind the local files read during the review. `node_modules` rows refer to the installed checkout, not a running deployment.

| Local file                                                                                                                          | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `package.json`                                                                                                                      | `8108be09b1eec963462db48cfcc510c98ba9f19c47ffb76b1038bed017819203` |
| `pnpm-lock.yaml`                                                                                                                    | `e6eb745ddcc1653b58fdf927fb0cff64a57ced64e4b5775ef9c04e3020621295` |
| `Dockerfile`                                                                                                                        | `a190e4a390341fdff927df2b43e961f3b9e824eac2c00cc1932fbcd9ddb62ba9` |
| `src/app/api/round-image/route.ts`                                                                                                  | `dcc65c2144fe9675d7235aa410b9937fc233bd3db36469e504d642dd4187866c` |
| `src/lib/round-image-cache.mjs`                                                                                                     | `1398b709bdb718c370629e0c925565e59678a3ad49ca163b72ffc6fac6ea2dbe` |
| `node_modules/sharp/src/common.cc`                                                                                                  | `c3c56a37bb780dfd97ee53d3556d9ba3d674b1b9cf7d57caf94248f982207a75` |
| `node_modules/sharp/src/pipeline.cc`                                                                                                | `445ed9aa726806dc01188cf13a2866ee47ccd38504cddd049e4e639703edc0e9` |
| `node_modules/sharp/package.json`                                                                                                   | `ad4a2535d72eb638053a38867b1abf43c328cd1c1dbae5cf4172d498365a8b97` |
| `node_modules/next/dist/server/image-optimizer.js`                                                                                  | `38b92fde5bc72aa23c999d283052da11a6dfb36be75c2d92683d539551065a3c` |
| `node_modules/.pnpm/@img+sharp-libvips-linuxmusl-x64@1.3.4/node_modules/@img/sharp-libvips-linuxmusl-x64/versions.json`             | `e2611d5d854815a8b33c8a3d2ec649511a9596ccf16844e8eae7cf81e79881c4` |
| `node_modules/.pnpm/@img+sharp-libvips-linuxmusl-x64@1.3.4/node_modules/@img/sharp-libvips-linuxmusl-x64/lib/libvips-cpp.so.8.18.7` | `979b625437190a1970b835164e0e30d47dc60159ce6a394ce78cc40cb9d59ab8` |

The following version-pinned upstream files were downloaded again on October 10. Their public URLs identify the reviewed source. No source archive or private data was added to the repository.

| Source                                                                                                                       | SHA-256                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [node_zlib.cc](https://raw.githubusercontent.com/nodejs/node/v22.23.3/src/node_zlib.cc)                                      | `f70274be7b7052024ac93816ab8a6f976da939e751125f3b0d0343efaf679456` |
| [node-lib-zlib.js](https://raw.githubusercontent.com/nodejs/node/v22.23.3/lib/zlib.js)                                       | `d3eaf3733448da63f3d50baae6ff313070c42a481451fddce4599bfaeffceed4` |
| [node-deps-zlib.h](https://raw.githubusercontent.com/nodejs/node/v22.23.3/deps/zlib/zlib.h)                                  | `71e0dcf4cacb6b1674550a3d9407344746d27cdce739e6e25189d0b620b005ed` |
| [node-deps-gzwrite.c](https://raw.githubusercontent.com/nodejs/node/v22.23.3/deps/zlib/gzwrite.c)                            | `469b1e58932ea11bdda2a153f6655f7b3c13254240fae157181b49ed1bc93b47` |
| [libvips-pngsave.c](https://raw.githubusercontent.com/libvips/libvips/v8.18.7/libvips/foreign/pngsave.c)                     | `f46e1348b5754d0bcdbdbd21e544c2ebbe8899eb8898519b78bcc35f14c4a999` |
| [libvips-vipspng.c](https://raw.githubusercontent.com/libvips/libvips/v8.18.7/libvips/foreign/vipspng.c)                     | `5b6713abaaeaed1b3ad7573dbda7fdc7abd53758a4b5744b8908a5c21ac1f6b5` |
| [libpng-pngwutil.c](https://raw.githubusercontent.com/pnggroup/libpng/v1.6.58/pngwutil.c)                                    | `a6e725ce8439edadea1e1f5092c4bcbf101d0a63cff0906271af6aceef89dfd3` |
| [libpng-pngrutil.c](https://raw.githubusercontent.com/pnggroup/libpng/v1.6.58/pngrutil.c)                                    | `748f956c603df9bafeaf82ad23f5d9ce57e2d7b0be21a68868eba46615cf8ddc` |
| [upstream-zlib-fix.patch](https://github.com/madler/zlib/commit/df84af25dc1942490e1d1c899a07619152a46148.patch)              | `110ff14375733173d8aa54574473424fbd7dfe4b81f1ca34a759c6fe14b15b14` |
| [node-zlib.gyp](https://raw.githubusercontent.com/nodejs/node/v22.23.3/deps/zlib/zlib.gyp)                                   | `d57e1daed966e3fb4094b7d7b24012d1afa14472059965dbeb6e52e590abde5f` |
| [node-zlib-BUILD.gn](https://raw.githubusercontent.com/nodejs/node/v22.23.3/deps/zlib/BUILD.gn)                              | `e40d08770ba695a47a7ebb5fabf7574716453ddfdd4d6185b88491a8b7f35dd0` |
| [zlib-ng-2.3.3-gzwrite.c](https://raw.githubusercontent.com/zlib-ng/zlib-ng/2.3.3/gzwrite.c)                                 | `9a2ec0a5524b384afb3849403304333458aa03e657bdf569064dc6f0ed36741f` |
| [zlib-ng-2.3.3-gzlib.c](https://raw.githubusercontent.com/zlib-ng/zlib-ng/2.3.3/gzlib.c)                                     | `abc6adb58a0ad651451e373135308d37d457a37601a7acc1bb30c205b4c65806` |
| [zlib-ng-2.3.3-gzguts.h](https://raw.githubusercontent.com/zlib-ng/zlib-ng/2.3.3/gzguts.h)                                   | `624e3c328b318d933e1f4244177ed460b2e2682b1058e304852dd4b358a3cfca` |
| [sharp-libvips-1.3.4-posix.sh](https://raw.githubusercontent.com/lovell/sharp-libvips/v1.3.4/build/posix.sh)                 | `333031b3b49bf1a16d0b9d6812d98f67c404218932ef8c0b389388524a524b36` |
| [sharp-libvips-1.3.4-versions.properties](https://raw.githubusercontent.com/lovell/sharp-libvips/v1.3.4/versions.properties) | `c0ad634f7c2ac8994f831dd0bcb5c60043db7ba4ddd9cc2dbc3703b15f4ec7e5` |

# Candidate file secret scan

The working-tree snapshot taken at 13:16 UTC on 6 October 2026 contains 1,181 files and 112,635,503 bytes. It includes tracked files and nonignored untracked files, including the audit evidence. It excludes ignored local credentials, local assets, temporary files, builds, dependencies, and Git metadata. The 23 tracked files already deleted from the working tree are listed in the inventory. No source file, Git index, or history changed for this scan.

No file exceeds GitHub's 100 MiB per-file limit. The largest file is 4,202,736 bytes. See [inventory.json](inventory.json) for exact paths, sizes, and hashes. The source was still changing during launch checks, so this is a pre-push snapshot, not proof of the final candidate commit. GitHub documents its file limit in [large-file guidance](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

Gitleaks 8.30.1 came from its [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). Both downloaded assets matched GitHub's published SHA-256 digests, and the archive also matched the release checksum file. The scan used the default configuration from that exact release, disabled inline allow comments, and used an empty ignore directory. Full redaction was enabled. The durable report contains locations and classifications only, without captured values or match text. See [provenance.json](provenance.json) and [Gitleaks usage](https://github.com/gitleaks/gitleaks#usage).

The scanner exited with code 1 for 59 generic-key matches. Review classified all 59. There are no identified repository credentials in this snapshot.

| Matches | Classification | Evidence |
| --- | --- | --- |
| 52 | SHA-256 file digests | Audit and content manifests contain paths with words such as `key` and `secret`, followed by file hashes. |
| 1 | Public image filename | The rights-replacement script lists four event-venue image paths. |
| 6 | Anonymous third-party visitor fields | The saved publisher page includes front-end form, consent, and analytics tokens. |

The workflow also contains explicit synthetic CI database passwords and application salts. These configure only the disposable test database and app. They are not production credentials, and the scanner did not flag them. This conclusion does not permit reusing those values for production.

## Publisher page classification

The six matches are in `docs/audits/2026-10-06/deep-review/flashback/flashback-primary/hobb-publisher-excerpt.html`, at lines 170 twice, 183, 4037, 4039, and 5117. The captured page reports `is_logged: false`, with no customer name, email, or address. Its consent customer and guest IDs are zero. Its consent customer token is the SHA-1 hash of an empty string.

A fresh read-only GET of the [same public publisher page](https://www.penguinlibros.com/ar/fantasia/149400-libro-las-naves-de-la-locura-las-leyes-del-mar-2-las-leyes-del-mar-2-9789506443542/fragmento) sent no Cookie or Authorization header. It also returned an anonymous customer. Four of the six old values were present in this fresh public response. The other fields belong to visitor consent and page-duration analytics. The script sends the latter with connection, page, and visit-time fields. The [classification facts](anonymous-page-classification.json) record these checks without any token value.

PrestaShop's official [front controller](https://github.com/PrestaShop/PrestaShop/blob/develop/classes/controller/FrontController.php) exposes front-end form tokens in its public page object. Its [token helper](https://github.com/PrestaShop/PrestaShop/blob/develop/classes/Tools.php) derives those tokens from the current customer context. The official [consent module](https://github.com/PrestaShop/psgdpr/blob/dev/psgdpr.php) emits an empty-customer hash when no customer exists. Its [request handler](https://github.com/PrestaShop/psgdpr/blob/dev/controllers/front/FrontAjaxGdpr.php) selects authenticated consent only when the current customer is already logged in; anonymous consent uses the guest, IP address, and date.

These facts support classifying the six fields as public anonymous visitor data, not account credentials. The archive is unchanged. No captured value was replayed, and no privileged endpoint was probed. The publisher's deployed code version and any custom server changes were not audited. This scan does not prove that every possible credential is absent, and it does not scan old Git history or text inside image pixels.

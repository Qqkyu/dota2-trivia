# Remaining Docker cleanup preflight

This record preserves the cleanup helper before final backup retention. The real metadata-only preflight passed on 10 October 2026 at 12:48 UTC. It removed no resources. Removal still requires root to confirm the hosted checks and private backup retention.

The scope is the six image tags and the stopped PostgreSQL restore fixture with its sole anonymous volume in the [ownership review](../docker-resource-review.md). The helper checks exact IDs and current users before removal. It refuses a reused fixture name, an orphan volume, changed volume metadata, active users, or changed image tags. Image removal uses only the approved tag names with `--no-prune`. It uses no force option.

The [helper source](cleanup-reviewed-docker.py.txt) defaults to read-only checks. Execution requires the explicit flag and a separate root confirmation record. The helper reads selected Docker metadata. It does not read container environments, process commands, database contents, or runner logs. The [preflight result](docker-cleanup-preflight.json) binds the helper hash to the observed resource metadata.

The [27 mocked tests](test_cleanup_guards.py.txt) cover the permitted cleanup and refusal paths. The [original test output](cleanup-guard-tests.log) and [archive replay](archive-replay.log) both pass. The replay imported the archived helper through a temporary path. It made no Docker calls.

Independent review found two gaps before this snapshot. The helper now rejects an existing volume if its exact fixture is already absent, and checks the volume creation time after removing that fixture. It also preserves untagged parent images with `--no-prune`. The reviewer reran all 27 cases. A later real preflight exposed an absent optional `HostConfig.Mounts` field. The [format error](docker-preflight-format-error.json) is retained. The final helper uses an optional map lookup, and the metadata-only preflight then passed. The [review record](docker-cleanup-review.json) states this sequence.

The source copies are byte-identical to the prepared files listed in [provenance.json](provenance.json). This is a dated preflight, not a receipt for removal. The execution step must refresh the resource checks after root confirms both gates. Its eventual result belongs in a separate final cleanup record.

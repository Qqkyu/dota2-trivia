# Intentionally cancelled CI run

[Run 38046647944](https://github.com/Qqkyu/dota2-trivia/actions/runs/38046647944) used commit `6e1eace126e89341052dddbd76eeb4ad4de584e6`. The operator cancelled it during browser installation after a separate review confirmed forced-color defects. The run stopped before application build.

The [workflow record](workflow-final.json) reports cancellation and no failed check. Runner setup, the source checkout, tool installation, and the frozen dependency install completed. The dependency audit, application checks, tests, build, image scan, and browser journeys were skipped. This partial run does not approve a release.

[Runtime metadata](runtime-metadata.json) records the startup limits and private container namespace. [Token metadata](token-lifecycle.json) records that the registration token file was absent after registration. [Cleanup](cleanup-result.json) removed the owned runner, dedicated volume, and registration without reported problems at 11:03:07 UTC on October 10. The [ownership record](ownership-record.json) preserves the selected lifecycle state, and the [registration check](runners-after-cleanup.json) reports no remaining runners. The archive includes no token value, environment file, or runner diagnostic log. The [provenance record](provenance.json) binds each copied input.

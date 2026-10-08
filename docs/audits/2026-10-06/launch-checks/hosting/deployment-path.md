# Resuming the existing Render service

Read-only review on 8 October 2026. No service, plan, domain, or billing setting changed during this review.

The existing service is still suspended by its user. Its branch is `main`, automatic deploys are off, compute is `free`, and its build plan is `starter`. It has no custom domains or separate build source. The [API evidence](deployment-path-readonly.json) records these fields and the checks below.

## What Render documents

- Deploy hooks return HTTP 409 for suspended services. The separate deploy API lists HTTP 409 but does not explain suspension behavior. It accepts an exact `commitId`. This review did not send a deploy request. [Deploy hooks](https://render.com/docs/deploy-hooks), [trigger deploy API](https://api-docs.render.com/reference/create-deploy).
- The resume API accepts the service ID and no commit or configuration body. The official CLI client makes the same bodyless request. Neither source promises which commit resume selects or whether a previous image can serve requests. [Resume API](https://api-docs.render.com/reference/resume-service-1), [official client at the reviewed commit](https://github.com/render-oss/cli/blob/5772e84f9b8ba99ba1b3890d73423a70ca68daf8/pkg/client/client_gen.go#L22870).
- A Render feedback item from 2020 describes resume as starting a build. It does not establish the current behavior or commit selection. [Historical feedback](https://feedback.render.com/features/p/dont-trigger-a-new-build-when-an-application-is-resumed).
- Disabling the `onrender.com` address requires a custom domain. This service has none, so that option cannot isolate the old app. [Custom domains](https://render.com/docs/custom-domains#disabling-your-onrendercom-subdomain).
- A restart keeps the deployed commit and its previous environment. It does not apply saved environment changes. Thus restart alone cannot apply this release. [Deploy behavior](https://render.com/docs/deploys#restarting-a-service).

## Bounded deployment sequence

Once CI has passed for a private candidate commit, keep automatic deploys off and set the linked branch to that candidate branch. Read the configuration back. Do not move the branch during deployment.

Try the normal deploy API with the exact checked SHA while the service remains suspended. If accepted, watch both service state and deploy status. Acceptance alone does not show that an image is live.

If Render returns a suspension conflict, the remaining route on this existing free service is resume, then inspect the new deploy immediately. Verify that its commit matches the checked SHA before continuing. If resume selects another commit, cancel it and suspend the service. If resume creates no deployment, trigger the exact commit explicitly. Monitor the public endpoint and suspend on any unexpected old app response.

This sequence reduces the chance of selecting old source. It cannot guarantee that the old image never serves a request between resume and the next observation. The public documentation gives no such guarantee. A separate free service built only from the candidate would avoid that particular risk, but would use a new URL and extra workspace resources. This review created neither service nor deployment.

## Existing usage

All six existing web services and static sites have zero deploys since 1 October 2026. The newest deployment on any of them was 29 August. Each returned history reaches before October. There were no current-month deployments in progress at the time of the check.

These counts are not a billing balance. They exclude deleted resources and other pipeline tasks. The inspected public API reference and official CLI client contain no pipeline-usage or spend-limit endpoint. Render exposes those controls in its dashboard. Starter includes at least 500 monthly minutes, depending on the workspace plan. Exceeding included minutes can buy more automatically unless a spend limit stops it. Keep the existing Starter plan and bound deployment time. Do not claim that these deploy counts prove zero possible cost. [Build pipeline](https://render.com/docs/build-pipeline).

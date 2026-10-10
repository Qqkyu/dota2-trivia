# Proxy policy helper

Prepared and independently reviewed on 8 October 2026. The helper has not changed the hosted service. All 31 offline tests passed, including an independent run with an empty inherited environment and blocked network connections. [Review result](review-result.json), [independent results](independent-tests.json), [test log](independent-tests.log).

The helper changes only `ARCADE_TRUST_PROXY` from `none` to `cf-connecting-ip`, then requests deployment of the same checked commit. It requires a recent successful hosted proof for the actual live deployment ID, the exact remote branch SHA, and a successful CI run for that SHA. It selects the candidate at execution time; no release SHA is fixed in the helper.

Before the update, it repeats the reviewed read-only proof and checks all five cases. It compares every service environment value before and after that proof. It checks the existing free web plan, Starter build plan, and database plan. It also requires no environment group linked to this service. The workspace group listing contains only metadata; the helper never retrieves a group's values or records unrelated group metadata. The public client declares this response as `EnvGroupMeta`. [Official schema at the reviewed commit](https://github.com/render-oss/cli/blob/5772e84f9b8ba99ba1b3890d73423a70ca68daf8/pkg/client/types_gen.go).

HTTP redirects are disabled. Environment values and operator credentials stay in memory. The receipt contains an HMAC tag, a keyed checksum, over the expected environment, checked service settings, and operation metadata. This lets later polling detect a change without storing the environment. Uncertain writes are not retried.

The independent review found two monitoring defects and reproduced them before repair. A historical deployment with the wrong commit could escape immediate suspension. A second pending deployment could also coexist with a reported successful result. The fixed helper checks every live deployment's commit and requires all listed deployments to be terminal before it allows external health checks. [Original reproductions](review-before.json).

## Invocation and receipts

These are mutation commands. They require the real hosted proof and a new approval review. The earlier rejection of the pre-proof change does not authorize execution.

```sh
python3 /tmp/queue-arcade-launch-checks/enable-render-proxy.py --apply
python3 /tmp/queue-arcade-launch-checks/enable-render-proxy.py --poll
```

`--apply` records its intended operation before sending the one-key update. It reads the full environment back, requests the exact commit, and makes four bounded status observations. A queued response remains pending. The old live deployment with the same commit does not count as the new deployment.

`--poll` can suspend the service and cancel a build if a check fails. It is not read-only. The helper checks its ten-minute deployment deadline on each invocation. It does not leave a monitor running in the background. Continue polling until it confirms the new live deployment or records a stopped operation.

Both commands write `../proxy-policy-change.json`. `externalHealthChecksAllowed` becomes true only after a new deployment of the expected commit is live and no listed deployment remains pending. Suspension fields distinguish an attempted request, an acknowledged request, and the state observed afterward. An uncertain outcome needs inspection before another mutation.

The files below are the frozen reviewed versions:

- [Operator helper](operator-source.py.txt).
- [Offline tests](offline-tests.py.txt).
- [File hashes](evidence-manifest.json).

To repeat the offline checks, restore the text files as `/tmp/queue-arcade-launch-checks/enable-render-proxy.py` and `/tmp/queue-arcade-launch-checks/test-enable-render-proxy.py`. Keep the separately reviewed `prove-render-ingress.py` at that location. Run only `python3 /tmp/queue-arcade-launch-checks/test-enable-render-proxy.py`. The tests replace all hosted operations with fixtures.

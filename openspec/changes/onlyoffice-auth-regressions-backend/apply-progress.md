# Apply progress

Change: `onlyoffice-auth-regressions-backend`

## Scope and workload

Only the two existing OnlyOffice specs and this receipt/tasks artifact were changed; production code and unrelated files remain untouched. The successor additions are bounded below the explicit 200-line limit (the pre-existing candidate diff is excluded from this slice). No commit was created.

## Task-level strict-TDD evidence

| Marker | RED | GREEN | TRIANGULATE | SAFETY-NET |
|---|---|---|---|---|
| U1 RED | Missing transport/JWT assertions identified by predecessor verification blocker | Added matrix | Cases assert `{ error: 1 }` | Baseline service 20 passed |
| U1 GREEN | Initial matrix compile caught tuple typing | Focused service command: 39 passed | HS256 verifier options and trimmed secret observed | Baseline retained |
| U1 TRIANGULATE | Prior receipt lacked verifier evidence | Verifier spy observed `{ algorithms: ['HS256'] }` | Invalid time/algorithm tokens reject before downstream work | Existing rejection tests pass |
| U1 SAFETY-NET | Baseline had no matrix coverage | Focused service suite passes | Empty/padded/non-string/mismatched inputs reject | Pre-change service suite 20 passed |
| U2 RED | Claim/binding gaps were the predecessor blocker | Added nested, route, status, body cases | Verified claims, not body fallback, drive decisions | Baseline service pass |
| U2 GREEN | First assertion set exposed scope/typing issues, corrected in spec only | Focused service: 39 passed | Exact safe response asserted | Existing service tests pass |
| U2 TRIANGULATE | No prior concrete claim receipt | Nested payload and mismatches exercised | Route/document/status disagreement rejects without persistence | No production calls added |
| U2 SAFETY-NET | Prior service suite passed | Post-change service: 39 passed | No production source changed | Baseline service: 20 passed |
| U3 RED | File-state safety gap was predecessor blocker | Added stream/delegation assertions | Verification precedes Prisma; missing versions avoid stream | Baseline controller 6 passed |
| U3 GREEN | Initial fs seam required createReadStream mock | Focused service/controller: 39/7 passed | Valid route-bound latest version streams | Invalid token has no Prisma call |
| U3 TRIANGULATE | Missing-version dereference was unproved | Tests now observe no stream call | Response headers and route identity observed | Existing controller behavior retained |
| U3 SAFETY-NET | Controller baseline passed 6 tests | Controller post-change passes 7 tests | No production stream code changed | Baseline controller: 6 passed |
| U4 RED | Callback leakage/forwarding gap was predecessor blocker | Existing and retained callback tests pass | Raw authorization forwarding and exact minimal bodies asserted | Focused baselines recorded |
| U4 GREEN | Prior receipt lacked task-level response evidence | Controller focused: 7 passed | Success/failure/exception normalize to `{ error: 0|1 }` | No sensitive detail asserted |
| U4 TRIANGULATE | Aggregate evidence was insufficient | Exact `json` calls remain asserted | HTTP callback contract stays minimal | No controller source changed |
| U4 SAFETY-NET | Baseline controller 6 passed | Post-change controller 7 passed | Existing UPDATE callback test remains green | Focused safety-net retained |
| U5 RED | Receipt granularity and budget were checked before completion | All 20 rows supplied | Allowed-surface review found no production edits | Pre-change focused baselines recorded |
| U5 GREEN | Full evidence was previously aggregate only | Focused suites pass; final commands recorded below | Task checkboxes visibly marked complete | Baseline evidence preserved |
| U5 TRIANGULATE | Scope and line-budget gate reviewed | Scoped ESLint/build/full suite required below | No `npm run lint` run; no sensitive response leakage | Candidate inventory remained excluded |
| U5 SAFETY-NET | Baselines available only for focused suites | Final verification results recorded below | Any unavailable result is reported, never inferred | No unrelated files touched |

## Verification

- Pre-change focused baseline: service 20 tests passed; controller 6 tests passed.
- Post-change focused: `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` — 39 passed.
- Post-change focused: `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` — 7 passed.
- Full suite: `npm test` — 30 suites and 212 tests passed.
- Build: `npm run build` — passed.
- Scoped ESLint: `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts --no-fix` — passed.
- `npm run lint` was not run, per strict-TDD instruction.

## Task persistence

All 20 implementation-owned task markers in `tasks.md` are marked `[x]`. No deviations from production design remain. Next recommended phase: `sdd-verify`.

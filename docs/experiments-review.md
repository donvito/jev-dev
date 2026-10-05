# Experiment implementation review

Reviewed on 5 October 2026, for v0.1.3. **The basic workflow works, but the implementation still needs stronger validation and failure handling before it should be treated as a robust unattended evaluation runner.** The usability changes below address how to create and identify question sets; they do not resolve every scoring or durability issue.

## Findings to address next

### Save failures do not stop the queue

High priority.

In [Experiments.svelte](../src/lib/Experiments.svelte), `persist()` calls `onupdate` synchronously, and `pump()` immediately schedules requests. In [App.svelte](../src/App.svelte), the experiment callback launches `void persist()`; its success or failure is not returned to the runner. A failed workspace write therefore does not prevent later API requests from starting. A storage error can leave completed work only in memory while the run continues.

This is a code-path finding; disk failure was not injected into the user's workspace. Before relying on long or expensive runs, make experiment persistence awaitable, surface a runner-local error, and pause scheduling when persistence fails. Add failure-injection tests for start, task completion, and resume.

### Labels are not checked against the selected question set

Medium priority.

[domain.ts](../src/lib/domain.ts) validates a dataset's overall shape but accepts arbitrary values inside `expected`. Experiment setup validates the request, not whether labels match question IDs, Noul booleans, Choice option IDs, or Score indexes. `calculateMetrics()` skips some incompatible values and counts them as missing.

Reproduced with a dataset containing `expected: {is_urgent: "true"}` and a Noul response of `0.9`: import succeeds, but the label is unscorable. The visual result view now marks this as an invalid label, and the `Errors & mismatches` filter includes it. Import-time validation is still missing. The comparison automation calculation uses strict equality, creating another inconsistency for this malformed label.

Add a preflight label report with row and question IDs, use a shared typed comparison function, and distinguish missing responses from invalid labels. Continue allowing intentionally unlabeled datasets, but explain that their accuracy is unavailable.

### Comparisons can score different questions or different subsets

Medium priority.

`launch()` allows any two distinct saved sessions, and `variantPolicy()` counts only expected labels with returned answers. The two variants can use different question IDs or incompatible rubrics and still show side-by-side accuracy and coverage. Failed requests and missing answers do not lower these conditional accuracy figures. One variant can therefore look better while being scored on an easier or smaller subset.

This behavior is confirmed by source inspection. Before treating a comparison as evidence, require compatible question IDs, types, option meanings, and rubrics, or explicitly show which labels were excluded from each variant. Present attempted, failed, validly scored, and shared paired counts next to percentages. Use the per-variant cards; the headline combines variants.

## What is already working well

- Each task captures its row, expected labels, question version, model, and exact request when launched. Later edits do not rewrite an existing experiment's captured configuration.
- Dataset `id` and `expected` stay out of the API request. Each row supplies the complete state, with shared questions and model added separately.
- Demo and live modes are visibly distinguished. Browser preview cannot make live requests through the native API path.
- The scheduler limits concurrent work within each experiment, finishes in-flight work after pause, and recovers queued work after interruption.
- Noul classification, Choice confusion matrices, Score error calculations, threshold boundaries, and repeatability statistics have unit coverage.
- Threshold lab identifies synthetic evidence and uses an inclusive human-review band. Exported policy boundaries match the calculation.

## Usability changes made with this review

- Replaced the ambiguous rename icon with a visible **Rename** button and a focused name dialog. Blank names are blocked and Cancel leaves the name unchanged.
- Renaming a saved question-set version updates its selectable name immediately and persists it without creating a new question version. Historical run and experiment records retain their original names.
- Renamed **Save** to **Save question set**, clarified the relationship to Playground sessions, and added a link back to Playground from experiment setup.
- The Playground **Experiment** action opens setup with the current saved version and its model selected. It asks the user to save first if viewing an unsaved or historical draft.
- Project switching now lives in a labeled header selector before the page name. The sidebar lists pages, Experiments names its active project and scopes its badge count, and experiment setup identifies the save destination.
- New sessions stay in the current project instead of silently returning to No project, which could hide them from the intended experiment selector.
- Added a shared visual response renderer to experiment records, with Choice distributions, Noul probabilities, Score rubrics, expected/predicted comparisons, and a JSON view. Missing and incorrectly typed labels are explicit, and the mismatch filter uses the same assessment as the visual view.
- Added the [step-by-step guide](experiments-guide.md) and matching sample questions and dataset.

## Validation and limits

Manual checks used a separate browser origin and synthetic examples, leaving the installed app's saved workspace untouched. A 12-row evaluation completed with 12 successes. Threshold lab showed the expected labeled Noul samples. A 20-task repeatability experiment paused, survived a reload, recovered as interrupted when reloaded during execution, and resumed. Saved question-set rename, cancellation, blank-name rejection, persistence across reload, version selection, and navigation from experiment setup were checked in the UI. A two-version comparison completed all 24 tasks without errors. Creation of a new named question set from scratch was also checked, including keeping it in the selected project. The guide’s support-ticket workflow completed 3 of 3 requests with no errors.

All 128 frontend tests pass, including five answer-assessment tests. Isolated UI fixtures also checked mixed answer types, missing and unlabeled answers, invalid labels, failed requests, JSON switching, comparison variants, repeated runs, and light/dark rendering. The supplied three-row guide dataset imports successfully, all requests validate, and all three synthetic labels match. These are workflow checks, not a live model accuracy benchmark. No paid live experiment was run, and the review did not stress-test large datasets or multiple simultaneous experiments.

Concurrency is per experiment, not a global account limit. The entire experiment history is cloned and saved on progress updates; large datasets and long histories need performance testing. There are no automated scheduler lifecycle tests yet. A live request interrupted before its response is saved may be repeated on resume; exactly-once execution is not guaranteed. Cancellation affects queued tasks, and there is no dedicated failed-task retry action.

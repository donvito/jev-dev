# How to create question sets and run experiments

An experiment runs your saved questions against several examples and compares the answers with labels you provide. Start in **Demo** to learn the controls without making API calls. Switch to **Live API** when you want to measure Jev's actual answers.

This guide covers v0.1.3. Use **Rename** to name a Playground session and **Save question set** to make that version available in Experiments. New sessions stay in the current project.

## Create your first question set

**A question set is a saved Playground session.** You create it in Playground, not inside the experiment dialog. Its session name becomes the name in **Shared question set**.

1. Close **New experiment** and open **Playground**. In the updated dialog, you can instead click **Create or edit question sets in Playground**.
2. Use the **Project:** selector at the top to choose where you want your experiment. The sidebar’s **Workspace** section contains Projects and Settings. Its **Current project** section contains Playground, Experiments, Datasets, and History; the project selector switches the data shown on those pages. The dataset and saved question set must belong to that same project. **No project** is also a separate location.
3. Click **New session**.
4. Click **Rename** beside the session title, enter **Support urgency**, and confirm **Rename**.
5. In the **State** pane, choose **JSON** and paste this example:

   ```json
   { "message": "Production is down. We are blocked and need urgent help." }
   ```

6. In the **Questions** pane, choose **JSON** and paste the contents of [support-questions.json](examples/support-questions.json). For a minimal first question, this is enough:

   ```json
   {
     "is_urgent": {
       "type": "noul",
       "instructions": "Does this support ticket describe an urgent issue that currently blocks the customer's work? Use only the ticket text."
     }
   }
   ```

7. Leave **Model** as `jev-latest`. Click **Save question set** in the toolbar, or press **⌘S / Ctrl+S**. Look for **Question set saved · v1**.
8. Open **Experiments → New experiment**. Under **Shared question set**, select **Support urgency · v1**. In the updated UI, the Playground **Experiment** button opens setup with your saved version selected.

You do not need to click **Run** before saving a question set. Autosaving a draft is also different from saving a question-set version: use the explicit **Save question set** button to add an entry to the experiment selector.

If you edit questions later, click **Save question set** again to create the next version. Select that version explicitly when you start an experiment. Existing experiments retain the questions and names captured when they started.

**Renaming:** the updated Rename dialog changes the selected saved version's display name immediately, without creating a new version or saving question edits. Renaming an unsaved draft gives it a name; you still need **Save question set**. Renaming while viewing a historical run names its editable draft, preserving the original recorded run.

## Understand the three inputs

| Input | What it supplies | Example |
| --- | --- | --- |
| Dataset | A different `state` for each request | Three support tickets |
| Saved question set | The same questions for every row | “Is this urgent?” |
| Model | The model requested for the experiment | `jev-latest` |

The Playground state is a sample used while writing questions. **Dataset rows replace it completely** during an experiment; they are not merged with it. Put any shared context needed by a question into every dataset row's state, or include it in the question instructions.

A dataset's `expected` values are your answer key. The app uses them locally to score responses. They are not sent to Jev, and they do not train the model. The `id` is a local row identifier.

## Create a dataset that matches your questions

Stay in the same project as **Support urgency**.

1. Open **Datasets → Create dataset**.
2. Name it **Support tickets practice**.
3. Paste the contents of [support-dataset.json](examples/support-dataset.json) into **Dataset rows**.
4. Click **Create dataset**. You should see three rows.

You can also use **Import CSV / JSONL** to load JSON, JSONL, or CSV. For a first attempt, use the supplied JSON file.

One row looks like this:

```json
{
  "id": "ticket_001",
  "state": { "message": "Production is down. We are blocked and need urgent help." },
  "expected": { "is_urgent": true }
}
```

The key `is_urgent` must exactly match the question ID in your saved question set. Expected labels depend on the question type:

| Question type | Expected label | Example |
| --- | --- | --- |
| Noul | JSON boolean | `true` or `false`, without quotation marks |
| Choice | An exact option ID | `"technical"` |
| Score | An integer rubric index, starting at zero | `2` for the third level |

Expected labels are optional, but accuracy cannot be calculated without valid labels. The current app does not fully check label compatibility before a run. Double-check spelling, types, Choice option IDs, and Score indexes yourself. Keep `model` and `questions` out of the top level of dataset rows; select them in experiment setup.

## Run a first dataset evaluation

Open **Experiments → New experiment** and use these settings:

| Field | Value |
| --- | --- |
| Experiment name | Support urgency baseline |
| Experiment type | Dataset evaluation |
| Dataset | Support tickets practice |
| Shared question set | Support urgency · v1 |
| Mode | Demo |
| Model | jev-latest |
| Concurrency | 1 |

Expand **Request preview**. Check that the request combines a dataset row's `state` with your saved `questions` and chosen `model`. It should not contain `expected` or the row ID. The preview shows the first row for dataset evaluations and comparisons, or the chosen row for a repeatability test.

Click **Run**. This example creates **three requests**, each containing all the questions. Concurrency means how many requests run at once, not how often each example is repeated.

When the run completes:

- Check **Successful requests** and the error count first. “Completed” means the queue finished; some requests can still have failed.
- Read **Label accuracy** as correctness across valid, labeled answers. Failed requests and unscorable labels are excluded, so a high percentage alone is insufficient.
- Click **View results** under **Row results**. The default **Visual** view shows Choice options, Noul probabilities, and Score rubrics, with expected-versus-predicted labels. Expand a question to see its full distribution. Switch to **JSON** for the exact request and response; **Input state** shows the record used.
- Use **Errors & mismatches** to focus on failed requests, mismatched answers, missing answers, or incorrectly typed expected labels. Unlabeled questions still show predictions without a match judgment.
- Use **Export** to keep the experiment record and its captured requests and results.

Demo responses are synthetic. A 100% demo score demonstrates the workflow, not Jev's real accuracy.

For a no-setup alternative, choose the seeded **Resume Screening** project, **Engineering resumes · demo** dataset, and **Engineering candidates · v1** question set. This runs 12 requests. The examples are fictional and may be absent if your workspace has been changed.

## Choose another experiment type

| Type | What it does | Request count |
| --- | --- | --- |
| Dataset evaluation | Runs one saved question set over all rows | Number of rows |
| Repeatability test | Runs one selected row repeatedly with one question set | Repetitions, from 2 to 50 |
| Variant comparison | Runs two saved question sets over the same dataset | Twice the number of rows |

For **Repeatability test**, choose a **Dataset row** and start with five repetitions. Agreement measures how often the most common answer appears; numeric spread shows how probabilities or scores vary. Stability does not establish correctness. Synthetic demo variation also does not measure the live model's stability.

For **Variant comparison**, edit and save a second version in Playground. Select the original as **Shared question set · A** and the new version as **B**. Keep question IDs, types, label meanings, and Score rubrics compatible so both variants are judged against the same answer key. Start by changing only the instructions.

The current comparison uses **one shared Model field for both variants**. It compares question sets, not two different models. Compare the separate variant cards; the headline accuracy combines their results. The app currently permits incompatible question sets without a warning, so the comparison can be misleading if their scored questions differ.

## Explore thresholds after a labeled Noul evaluation

Open **Threshold lab**, select a completed experiment, then select your Noul question. Noul returns `P(true)`, a value between 0 and 1.

With the initial thresholds:

- Below `0.20`: decide NO.
- Above `0.85`: decide YES.
- From `0.20` through `0.85`, including both boundaries: send to review.

The regular evaluation accuracy uses a different cutoff: `P(true) >= 0.5` counts as true. Moving threshold sliders changes only the policy analysis, not the completed experiment's answers or baseline accuracy.

Watch **Automatic decisions**, **Human review**, and **False approvals / rejections** together. Automatic decision accuracy is calculated only outside the review band. Coverage is based on the selected valid labeled responses, not all attempted requests. Use **Export policy** to save the boundaries; the app does not deploy them to a service. Test chosen thresholds on separate labeled examples before relying on them.

## Run with the live API and manage progress

In the desktop app, save your API key in **Settings → TypeSafe connection**, then select **Live API** in experiment setup. The browser preview supports Demo only. Start with a small dataset and concurrency 1 so you can inspect requests and errors. Live requests use your API account; the displayed count is the planned task count and does not include possible transport retries.

**Pause** stops new tasks from starting; requests already in flight finish. **Resume** continues queued work and requires the same execution mode as the original experiment. **Cancel experiment** cancels queued work but does not abort requests already sent.

The queue runs while the app is open. If you close or reload during a run, it can return as **interrupted** and be resumed. An in-flight request may already have reached the API before its result was saved, so resuming can repeat that request. To reduce that risk, pause and let in-flight requests finish before closing. There is no dedicated “retry failed rows” control yet.

## When a selector is empty

| Symptom | What to check |
| --- | --- |
| Shared question set is empty | Save a Playground session with valid questions, then return to the same project in Experiments. |
| Your new edits are missing | Save a new question-set version and choose it explicitly. Draft autosave does not publish a version. |
| Dataset is empty | Create or import a dataset in the current project. |
| Accuracy is a dash | Add correctly typed expected labels whose IDs match the selected questions, then rerun. |
| Threshold lab is empty | Complete an experiment with Noul responses and boolean expected labels. |
| Resume is disabled | Restore the experiment's original Demo or Live API mode; live mode also needs a saved key. |

For implementation strengths, known gaps, and the tests performed, see [the experiment implementation review](experiments-review.md).

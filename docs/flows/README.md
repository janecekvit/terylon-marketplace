# Flows

How something travels through the marketplace end to end — the dynamic view. A flow spans components, which is why it lives here rather than in any one plugin's `README.md`: a component's own documentation can only see its own hop.

## Articles

| Article | Follows |
|---|---|
| [change-to-consumer-repo](./change-to-consumer-repo.md) | an edit in this repository until a product repository executes it — and the one step whose omission makes the whole path a no-op |
| [forge-resolution](./forge-resolution.md) | a run deciding which forge it targets and which adapter fills the port, including what it does when it finds neither |

## Writing one

**A flow is drawn before it is described.** Boxes top to bottom, the decision on each arrow, the branch conditions visible. A reader who has seen the shape reads the prose twice as fast; a reader who has not is assembling the picture a sentence at a time and getting it wrong.

**Name every hop's owner.** A flow that says "then it is published" without naming the file that publishes it cannot be checked against the code, and it is the first thing to go stale.

Flows are the articles most likely to rot, because a flow has no owner: every component's author can change their own hop while believing they touched nothing that matters. That is what the `## Where it lives` table is for — it names every file the flow passes through, so a grep from a diff finds this article.

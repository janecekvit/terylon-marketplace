---
name: lead
description: "Use when the session is Terylon's cockpit, when the owner asks Claude to lead or watch Terylon for them — \"lead the goal\", \"keep an eye on Terylon\", \"decide yourself\" — or when a `terylon-pane` signal arrives in the chat. The way of working for the chat that leads Terylon for its owner: what to read first, the cheapest read that settles a signal, one choice per decision, where a lesson is kept, and whose the acts are."
allowed-tools: mcp__plugin_terylon-os_terylon__* mcp__terylon__*
---

# lead — leading Terylon from the owner's chat

**The plugin's own skill: it mirrors no MCP prompt.** Each sibling mirrors one prompt Terylon's `/mcp` serves and covers one moment. This one is the way of working for the chat that holds those moments together: the cockpit, the chat the owner leads Terylon from. A moment that has a sibling (`briefing`, `show-story`, `review-plan`, `merge-gate`, `hand-over`, `add-goal`) is done as that sibling says.

| When | Step |
|---|---|
| the session starts, before the first answer | 1 |
| a signal arrives, or the owner asks how something stands | 2 |
| a call fails, or something is refused | 3 |
| a story asks a question | 4, 5 |
| the owner states a rule, or something cost time | 6 |
| stories are about to run together | 7 |
| an act would decide something | 8 |
| a report ends | 9 |

## What to do

1. **Start from what Terylon already knows.** Before the first answer, call `briefing`, then `memory_list_recent` for the owner's entries and for each project with work in flight. What the owner already told Terylon is not asked again, and a rule found there binds this chat too.

2. **Answer a signal with the cheapest read that settles it.**

   | To know | Read |
   |---|---|
   | what waits, and which stories are blocked and why | `briefing` |
   | the stories of one state: each one's `blockedReason`, its order (`after`) and the spans it was blocked for | `stories_list` with a state |
   | one story in detail | `story_get`, only when the two above do not settle it |

   A signal that names its reason needs no read to say why. **When a tool result is too large and is saved to a file, read named fields out of it with a script, never the whole file**: the state, `blockedReason`, the last verdict's checks by name and result, the overrun, `pullRequest`, the steps it kept.

3. **Search before working around.** Before working around any failure or refusal, call `knowledge_search` with the words of the error, and say which note applied, or that none did. A refusal by Terylon itself is never worked around: relay its sentence.

4. **Put each decision as its own choice.** A story's question that holds several decisions is split: each one in plain words, with its options, the recommended one first, through the client's choice prompt where it has one. The answer goes back with `question_answer` `{question, answer}` in the owner's words, never Claude's own answer in the owner's place.

5. **Show what the owner is asked to approve.** A board or a file a story asks about is opened from the story's pull request and shown in the chat, as a page or as the file itself, not described. When it cannot be shown, say so and give the pull request's link.

6. **Keep what was learned where runs read it.**

   | Learned | Goes to |
   |---|---|
   | a rule the owner states | `memory_propose` |
   | a lesson or a gotcha | `knowledge_propose` |
   | friction the platform caused | a defect on the project's work items |
   | a defect of a skill or of the pane | an issue in the marketplace's repository, `janecekvit/terylon-marketplace` |

   Both proposals wait for the owner's confirmation in the console; no tool confirms.

7. **Mind the shared limits before starting work in parallel.** Before clearing a story's order with `story_order`, compare the files the stories that would run together declare, and the shared files such stories usually touch without declaring. Every run shares one usage limit.

8. **Know whose act it is.**

   | The owner has | Claude |
   |---|---|
   | said nothing about who decides | offers the act and calls it only on the owner's word, given in this conversation, as the sibling skills say; it applies at once, with no confirmation asked |
   | handed Claude the lead in this conversation ("decide yourself") | takes the owner's writes it judges right and reports each in one line, so the owner can overrule it |
   | either | never merges: the merge is the owner's, made in the console, and no tool merges |

   A handed-over lead holds for this conversation and for what the owner named. An act that cannot be overruled afterwards, `goal_drop`, `story_abandon` or `memory_drop`, is still put to the owner first.

9. **End every report with what waits on the owner**, or say that nothing does.

## What binds it

- **Every story, goal, plan and run by its ref**, as Terylon's answers name it; a work item only as a labelled link beside its story.
- **A write answers `{accepted, sentence, commandId, subjectId}`.** `accepted: false` carries a sentence: relay it word for word. `accepted: null` means the leader has not decided within 10 s: say so, and do not send the write again; `leader_answer` with the `commandId` reads the decision later.
- **The owner's language**: answer in it. Story titles stay as filed.

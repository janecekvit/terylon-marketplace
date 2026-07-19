# Terylon Feature Specification Standard

**Version:** 1.0
**Last updated:** 2026-07-18

This document is the single source of truth for the structure of Feature work items. It is edited directly in this repo; changes go through a PR.

---

## 1. Naming

Format: `[Optional prefix] <user-benefit statement>`

### Rules

- State the benefit from the user's point of view, not the implementation's.
- The title must be understandable without further context.
- Describe the **outcome**, not the technical change.
- No jargon, acronyms, or internal codenames in the benefit statement.

### Prefix

At most one prefix per Feature, in the `[ProjectName]` form, for work belonging to a specific initiative.

### Examples

**Good:**
- `Let administrators configure SSO against their own identity provider`
- `[Atlas] Export the audit log to SIEM tools`

**Bad:**
- `Refactor auth middleware` — technical, the benefit is not visible
- `SSO` — too vague, not a statement
- `[Atlas] [Beta] RBAC rewrite` — double prefix, jargon

---

## 2. Template

Every field must be filled in, or explicitly marked `N/A` with a short note explaining why.

---

**Problem (why)**

*What is broken, missing, or risky today? Who does it affect and how? Why are we solving it now?*

---

**User needs**

*User needs and user stories. Format: "As a \<role\> I want \<goal\> so that \<benefit\>."*

*List each role separately. If the Feature serves several roles with differing needs, enumerate them — they become separate User Stories.*

---

**Design & proposal (what)**

*The proposed solution. What does the result look like? What is in scope and what is not. Optionally success metrics.*

*When several solution variants exist, list them and justify the choice. A rejected variant with its reason is valuable information for whoever looks at the Feature six months from now.*

---

**UX**

*User flow — the path the user takes, step by step.*

*Links to wireframes or Figma designs.*

*Edge state behaviour: empty state (the user has nothing yet), error state (what went wrong and what to do about it), loading state (what the user sees before the data arrives).*

*When the Feature is purely backend and has no UI, write `N/A - no user interface`.*

---

**Requirements**

*Functional requirements: what the system must do. Describe **what**, not **how**. Every requirement must be testable.*

*Non-functional requirements: performance, availability, security, compatibility — only those genuinely relevant to this Feature.*

---

**Acceptance criteria**

*Measurable criteria in Given / When / Then form:*

```
Given <initial state>
When <user action>
Then <expected result>
```

*Cover the negative paths too — what happens on invalid input, a missing permission, an outage of a dependent service.*

---

**Out of scope**

*Explicit boundaries. What this Feature deliberately does not address, and why.*

---

## 3. Definition of Ready

A Feature is ready to be broken down into User Stories when:

- [ ] The title follows the rules in Section 1
- [ ] Problem is concrete and evidenced, not an assumption
- [ ] User needs cover every affected role
- [ ] Design & proposal delimits both the scope and what falls outside it
- [ ] UX describes the flow and all three edge states (or `N/A` with a reason)
- [ ] Requirements are testable and describe what, not how
- [ ] Acceptance criteria are in Given / When / Then form and cover the negative paths
- [ ] No field contains an invented value — open questions are marked `TBD` with a note

## 4. Quality bar

A Feature is good when a developer can derive User Stories from it without asking follow-up questions, and a tester can write test scenarios straight from the acceptance criteria.

**Never invent inputs you cannot know** — customer names, external references, business context, numbers from real-world operation. Either ask, or mark `TBD` with a note. A confident-looking spec full of invented values is worse than one that admits its gaps.

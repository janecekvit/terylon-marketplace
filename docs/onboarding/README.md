# Onboarding

Getting a repository, a person or an agent productive against this marketplace.

The root [`README.md`](../../README.md) is the front door and stays short on purpose: what this is, the dependency graph, and a quickstart. Everything that only some readers need lives here.

## Articles

| Article | For |
|---|---|
| [consumer-setup](./consumer-setup.md) | someone wiring a product repository into the marketplace — the settings, the forge configuration, and authentication |
| [marketplace-development](./marketplace-development.md) | someone changing the marketplace itself and wanting to test a branch before merging it |
| [migrating](./migrating.md) | a repository still enabling `terylon-devops` or `terylon-metrics`, or expecting `write-plan` in `terylon-core` |

## The order to read them in

```
first time wiring a repository        ──▶  consumer-setup
    │
    ├── it already worked, then stopped  ──▶  runbooks/
    │
    └── an old plugin key is enabled     ──▶  migrating

changing the marketplace itself       ──▶  marketplace-development
```

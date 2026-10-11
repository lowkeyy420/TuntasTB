# TuntasTB

Side-effect triage and dropout early-warning for families supervising a TB patient at home, with the Puskesmas TB nurse in the loop.

Every daily check-in from the patient or their family PMO is sorted into **GREEN** (continue), **YELLOW** (nurse will call) or **RED** (stop and go to the Puskesmas today) by fixed guideline rules. Every morning the nurse gets a ranked list of who is about to drop out and why. The LLM only reads messy input and writes plain explanations; rules decide.

> Status: under construction. See [`docs/build-plan.md`](docs/build-plan.md) for the full plan.

## Development workflow

This project uses spec-driven development with [OpenSpec](https://github.com/Fission-AI/OpenSpec).
Specs live in `openspec/specs`, proposed changes in `openspec/changes`.

- `main`: stable, initial setup
- `development`: all feature work, Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, ...)

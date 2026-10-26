---
name: hypercerts
description: Use this skill when a user asks for work across the Hypercerts stack and a focused Hypercerts skill may be needed or missing. This includes ePDS, Hyperindex, Hypercerts lexicons, ATProto-based Hypercerts infrastructure, Certified Group Service (CGS), OrgLabeler / Certified Organization Labeler labels, and future Hypercerts tools. Use it even when the user does not explicitly ask which skill to use or how to install one. This catalog and installer skill chooses the smallest matching focused skill, installs it if needed, then reads and follows that focused skill's SKILL.md.
---

# Hypercerts Skills

This meta-skill helps users discover and install focused Hypercerts agent skills. It does not contain the full task instructions for ePDS, Hyperindex, CGS, OrgLabeler, or Hypercerts lexicons.

Use it when a user asks about Hypercerts and the right focused skill is not installed yet, or when they ask which Hypercerts skill they need.

## Default procedure

1. Choose the smallest matching focused skill from [the skill map](references/skill-map.md).
2. Install it using [the install reference](references/install.md).
3. Use `--yes` in automated agents, scripts, CI jobs, and other non-interactive environments.
4. Locate and read the installed focused skill's `SKILL.md`.
5. Continue using the focused skill's own instructions.

## Gotchas

- Do not try to invoke another skill by name from this skill. The portable Agent Skills format does not define cross-skill invocation.
- Do not assume where a skill was installed. Locate its `SKILL.md` if needed.
- If a source-repository install fails, retry with the direct-directory fallback from the skill map.

## References

- [Skill map](references/skill-map.md): task-to-skill mapping, source repositories, and fallback URLs.
- [Install reference](references/install.md): generic install, fallback, and locating workflow.

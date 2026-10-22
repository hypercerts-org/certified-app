# Installing Hypercerts Skills

Read this file for the generic focused-skill install workflow. Read [the skill map](skill-map.md) first to choose a skill and copy its source repository command or direct-directory fallback URL.

## Standard install

Install the selected focused skill from its source repository:

```bash
npx skills add <owner/repo> --skill <skill-name> --yes
```

Use `--yes` from automated agents, scripts, CI jobs, or any other non-interactive environment. Without it, the installer may wait for input such as where to install the skill.

For an interactive human-run install, `--yes` is optional.

## List skills before installing

To inspect a source repository without installing anything:

```bash
npx skills add <owner/repo> --list
```

## Direct-directory fallback

If the repository install fails, retry with the fallback URL from [the skill map](skill-map.md):

```bash
npx skills add <direct-skill-url> --yes
```

Keep `--yes` for non-interactive installs.

## Locate the installed skill

Do not assume a specific agent runtime, project layout, or installation path. If needed, search for the focused skill's `SKILL.md`:

```bash
find . "$HOME" -path '*/skills/<skill-name>/SKILL.md' 2>/dev/null
```

## After installing

Read the focused skill's `SKILL.md` before continuing. This meta-skill only identifies and installs the right focused skill; the focused skill contains the task-specific instructions.

## Useful flags

- `--list` lists skills in the source without installing them.
- `--skill <name>` installs one named skill from a multi-skill repository.
- `-g` installs globally instead of in the current project.
- `-a <agent>` targets a specific agent.
- `-y` / `--yes` skips prompts.
- `--all` installs all discovered skills to all detected agents without prompts.

# Security

SideShot runs on your machine and in your CI. With `--publish` or `--update-pr` it pushes to a branch of your
repository and edits a pull request's description. So a mistake in it could write where it should not, or
put something private where everyone who can see the pull request can read it.

## Reporting a vulnerability

Please report it privately, not in a public issue:
[**report a vulnerability**](https://github.com/victorsaly/sideshot/security/advisories/new) (GitHub's private
reporting, under the Security tab).

Say what you ran, what happened, and what you expected. A command line or a `.sideshot.json` that shows it is
the most useful thing you can send. A fix, and credit if you want it, goes out in the next release.

## Supported versions

Only the latest release is fixed. Update the plugin (or pull the latest skill) to get fixes.

## What SideShot trusts

- **The project it runs in.** SideShot loads Playwright from the project and runs the `--setup` module the
  project names, as they are. Run it only in a repository you trust, as you would its tests.
- **What it is asked.** Flags and `.sideshot.json` are checked before a browser opens. Picture names cannot
  leave the output folder, the branch name never reaches git as an option, and no login or token from the
  addresses it is given is written into a pull request.

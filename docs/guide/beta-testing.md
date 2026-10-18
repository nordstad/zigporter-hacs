# Beta testing

New features are sometimes published as **beta releases** before they become part of a stable release. Beta releases are opt-in: you only receive them if you turn on the **Pre-release** switch for Zigporter. Stable users are never offered a beta.

!!! warning
    Beta releases may contain bugs. Make a backup before installing one.

## Before you start

Create a Home Assistant backup (**Settings → System → Backups**). Going back to an earlier version is best done by restoring a backup.

## Get beta releases

The **Pre-release** switch is provided by HACS (or the Marketplace in Home Assistant 2026.11 and newer), not by Zigporter. It is disabled by default.

1. Open **Settings → Devices & Services** and find the **Zigporter** device:
    - **HACS**: under the **HACS** integration.
    - **Marketplace** (Home Assistant 2026.11+): under the **Marketplace** integration.
2. Open the **Pre-release** entity (usually `switch.zigporter_pre_release`).
3. If it is disabled, enable it from the entity settings (gear icon → **Enabled**).
4. Turn the switch **on**.
5. Wait for the update check, or trigger one, then install the Zigporter update from **Settings → Updates**. Beta versions look like `0.10.0b1`.
6. Restart Home Assistant and refresh your browser (F5).

## Report problems

[Open an issue](https://github.com/nordstad/zigporter-hacs/issues) and include:

- The Zigporter version (for example `0.10.0b1`)
- What you did and what you expected
- Relevant errors from **Settings → System → Logs**

## Return to stable

1. Turn the **Pre-release** switch **off**. This stops new betas from being offered.
2. You stay on the installed beta until a newer stable release is published. Stable `0.10.0` is newer than `0.10.0b1`, so it is installed as a normal update.
3. To leave the beta right away, restore the backup you made before installing it.

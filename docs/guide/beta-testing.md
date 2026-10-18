# Beta testing

New features are sometimes published as **beta releases** before they become part of a stable release. Beta releases are opt-in: you only receive them if you turn on the **Pre-release** switch for Zigporter. Stable users are never offered a beta.

!!! warning
    Beta releases may contain bugs. Make a backup before installing one.

## Before you start

Create a Home Assistant backup (**Settings → System → Backups**). Going back to an earlier version is best done by restoring a backup.

## Get beta releases

The **Pre-release** switch is provided by HACS (or the Marketplace in Home Assistant 2026.11 and newer), not by Zigporter. It is **disabled by default**, so it does not appear on the device page until you enable it. Find it in the entity list instead:

1. Open **Settings → Devices & Services → Entities**.
2. Search for `pre-release` and find the switch that belongs to the **Zigporter** device (usually `switch.zigporter_pre_release`). If you cannot see it, enable the option to show disabled entities in the filter menu.
3. Open it. If Home Assistant says it is disabled, enable it from the entity settings (gear icon → **Enabled**), then wait a moment for it to load.
4. Turn the switch **on**.
5. Check for updates, then install the Zigporter update from **Settings → Updates**. Beta versions look like `0.10.0b1`. If no update shows up, trigger a check from the HACS (or Marketplace) update entity for Zigporter.
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

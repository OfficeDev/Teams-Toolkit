// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as semver from "semver";

/** Build-time v4 template distribution config. See resolve-template-source spec. */

export interface V4TemplateConfigInput {
  /** Freshly minted templates version. */
  version: string;
  /** CD `goproduct` flag: `true` when this build ships to users. */
  goproduct: boolean;
  /** The current `range` in `templates-config.json`, kept when still satisfied. */
  previousRange: string;
}

export interface V4TemplateConfig {
  /** `~major.minor` SemVer range the build may resolve within. */
  range: string;
  /** `true` for test/offline builds (bundled floor); `false` for shipped builds. */
  bundled: boolean;
  /** The clean, suffix-free version published to the v4 channel (floor pin). */
  localVersion: string;
}

/** Non-shipping builds resolve from the bundled floor; shipping builds resolve online. */
export function computeBundled(goproduct: boolean): boolean {
  return !goproduct;
}

/**
 * The clean, suffix-free version published to the v4 channel for a minted
 * version. It mirrors the VSIX version `vsc-version.sh` mints so the template
 * channel and the shipped extension always share one version:
 *
 *   - PREVIEW (any `-beta.<date>`-suffixed version): the odd-minor prerelease
 *     line, date-stamped patch (`6.11.<YYYYMMDDHH>`). An even-minor base (lerna
 *     `prerelease` keeps the stable `6.10.x` minor) is bumped to the next odd
 *     minor, exactly as `vsc-version.sh` bumps the VSIX from `6.10.x` to
 *     `6.11.<date>`; an already-odd base keeps its minor. The date is read from
 *     the `-beta.<date>` preid, so every preview build gets a unique version
 *     that satisfies `~major.minor`.
 *   - STABLE (no date-stamped suffix): `major.minor.patch` as-is; the stable
 *     lane already mints a clean version.
 *
 * This is the v4-channel counterpart of the clean `templates@<major>.<minor>.<date>`
 * pattern the v3 channel uses for prereleases.
 */
export function computeV4PublishVersion(version: string): string {
  const parsed = semver.parse(version);
  if (parsed === null) {
    throw new Error(`Cannot compute v4 publish version: "${version}" is not valid SemVer.`);
  }
  const dateStamp =
    parsed.prerelease[0] === "beta"
      ? parsed.prerelease.find(
          (segment): segment is number => typeof segment === "number" && segment >= 1_000_000_000
        )
      : undefined;
  if (dateStamp !== undefined) {
    const minor = parsed.minor % 2 === 0 ? parsed.minor + 1 : parsed.minor;
    return `${parsed.major}.${minor}.${dateStamp}`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

/** Compute the SemVer range a build may resolve within. */
export function computeRange(version: string, previousRange: string): string {
  const parsed = semver.parse(version);
  if (parsed === null) {
    throw new Error(`Cannot compute v4 template range: "${version}" is not valid SemVer.`);
  }
  if (semver.intersects(previousRange, `${parsed.major}.${parsed.minor}.0`)) {
    return previousRange;
  }
  return `~${parsed.major}.${parsed.minor}`;
}

/** Compute the full v4 distribution config block for `templates-config.json`. */
export function computeV4TemplateConfig(input: V4TemplateConfigInput): V4TemplateConfig {
  const localVersion = computeV4PublishVersion(input.version);
  return {
    // Range follows the published version, not the raw minted minor: a preview
    // minted on a stable `6.10.x` base publishes as `6.11.<date>`, so the range
    // must widen to `~6.11` to resolve it.
    range: computeRange(localVersion, input.previousRange),
    bundled: computeBundled(input.goproduct),
    localVersion,
  };
}

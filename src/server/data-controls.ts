/**
 * Whether this FinPilot may reset or clear its own data from Settings.
 *
 * Fail closed: only FINPILOT_DATA_CONTROLS=enabled turns them on. Unset,
 * "disabled" or anything else keeps them off, so a deployment (a shared,
 * public demo) can never expose them by omission. The Settings section is
 * hidden and the commands refuse, so the switch holds without the UI.
 */
export const dataControlsEnabled = (): boolean => process.env.FINPILOT_DATA_CONTROLS === "enabled";

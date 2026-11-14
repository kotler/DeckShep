/** Preserve the launcher's cleanup boundary if spawn succeeds but identity fails. */
function launchEditor(run, executable, report) {
  run.gate.checkBoth();
  run.launchAttempted = true;
  try {
    const child = run.owned.spawn(executable, [report], {
      cwd: run.root,
      env: run.env,
    });
    run.children.editor = child;
    return child;
  } catch {
    // Never delete the evidence root or claim cleanup for an untracked child.
    run.unprovenLaunch = true;
    throw Error('Owned editor launch failed');
  }
}
module.exports = { launchEditor };

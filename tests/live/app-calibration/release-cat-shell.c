/* Herdr wraps space.new argv in SHELL -lic. This disposable test shim accepts
 * the calibration cat command and (in navigation builds) two fixed reporters.
 * It never interprets shell text or profiles. */
#include <string.h>
#include <unistd.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  if (argc < 5 || strcmp(argv[1], "-lic") != 0 ||
      strcmp(argv[2], "\"$@\"; exec \"$0\" -li") != 0 ||
      strcmp(argv[0], argv[3]) != 0)
    return 64;
#ifdef DECKSHEP_MODEL_DELIVERY
  const char *codex = getenv("DSH_TEST_CODEX");
  if (argc == 5 && codex && !strcmp(argv[4], codex)) {
    execl(codex, "codex", "--no-daemon", "--no-alt-screen", "--sandbox", "read-only", (char *)0);
    return 65;
  }
#endif
#ifdef DECKSHEP_INPUT_GATE
  const char *recorder = getenv("DSH_TEST_INPUT_RECORDER");
  if (argc == 5 && recorder && !strcmp(argv[4], recorder)) {
    execl(recorder, "input-recorder", (char *)0);
    return 65;
  }
#endif
  if (strcmp(argv[4], "/bin/cat") != 0) return 64;
#ifdef DECKSHEP_NAVIGATION
  /* Fixed PSP reports from disposable terminals, parsed by the actual Core. */
  if (argc == 6) {
    const char *report;
    if (!strcmp(argv[5], "pw-codex"))
      report = "\033]7501;state=idle:app=codex:title=Q29kZXg=\033\\";
    else if (!strcmp(argv[5], "pw-claude"))
      report = "\033]7501;state=blocked:kind=question:app=claude-code:title=Q2xhdWRl\033\\";
    else return 64;
    size_t length = strlen(report);
    if (write(STDOUT_FILENO, report, length) != (ssize_t)length) return 65;
    for (;;) pause();
  }
#endif
  if (argc != 5) return 64;
  execl("/bin/cat", "cat", (char *)0);
  return 65;
}

/* Herdr wraps space.new argv in SHELL -lic. This disposable test shim accepts
 * only that reviewed cat command; it never interprets shell text or profiles. */
#include <string.h>
#include <unistd.h>
int main(int argc, char **argv) {
  if (argc != 5 || strcmp(argv[1], "-lic") != 0 ||
      strcmp(argv[2], "\"$@\"; exec \"$0\" -li") != 0 ||
      strcmp(argv[0], argv[3]) != 0 || strcmp(argv[4], "/bin/cat") != 0)
    return 64;
  execl("/bin/cat", "cat", (char *)0);
  return 65;
}

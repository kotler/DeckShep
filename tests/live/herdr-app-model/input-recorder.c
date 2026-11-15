/* Disposable recipient for the Core input-gate experiment. Accept only the
 * fixed probe alphabet, record receipt time, and never interpret shell input. */
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>
#include <termios.h>
#include <unistd.h>

int main(void) {
  const char *file = getenv("DSH_TEST_INPUT_LOG");
  if (!file) return 64;
  int fd = open(file, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0600);
  if (fd < 0) return 65;
  struct termios original, raw;
  if (tcgetattr(STDIN_FILENO, &original)) return 66;
  raw = original;
  cfmakeraw(&raw);
  if (tcsetattr(STDIN_FILENO, TCSANOW, &raw)) return 66;
  if (dprintf(fd, "{\"ready\":true}\n") < 0) return 67;
  if (write(STDOUT_FILENO, "recorder ready\r\n", 16) != 16) return 67;
  unsigned char byte;
  while (read(STDIN_FILENO, &byte, 1) == 1) {
    if (byte < 'a' || byte > 'f') return 68;
    struct timeval now;
    if (gettimeofday(&now, NULL)) return 69;
    long long ms = (long long)now.tv_sec * 1000 + now.tv_usec / 1000;
    if (dprintf(fd, "{\"byte\":%u,\"ms\":%lld}\n", byte, ms) < 0) return 67;
  }
  tcsetattr(STDIN_FILENO, TCSANOW, &original);
  close(fd);
  return 0;
}

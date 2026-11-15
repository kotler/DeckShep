/* Test-only bridge for herdr.exec. No shell, arbitrary endpoint or command.
 * The test parent owns this private socket and validates the bounded request. */
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
int main(int argc, char **argv) {
  const char *home = getenv("HERDR_APP_HOME");
  struct sockaddr_un address = { .sun_family = AF_UNIX };
  if (argc != 2 || !home || strlen(argv[1]) > 131072) return 64;
  int n = snprintf(address.sun_path, sizeof(address.sun_path), "%s/data/model-relay.sock", home);
  if (n < 0 || (size_t)n >= sizeof(address.sun_path)) return 64;
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  struct timeval timeout = { .tv_sec = 4 };
  if (fd < 0 || setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) ||
      setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) ||
      connect(fd, (struct sockaddr *)&address, sizeof(address))) return 65;
  size_t left = strlen(argv[1]); const char *at = argv[1];
  while (left) { ssize_t wrote = write(fd, at, left); if (wrote <= 0) return 65; at += wrote; left -= (size_t)wrote; }
  if (write(fd, "\n", 1) != 1) return 65;
  char bytes[4096]; size_t total = 0;
  for (;;) {
    ssize_t got = read(fd, bytes, sizeof(bytes));
    if (got <= 0) return 65;
    total += (size_t)got; if (total > 131072) return 65;
    if (fwrite(bytes, 1, (size_t)got, stdout) != (size_t)got) return 65;
    if (memchr(bytes, '\n', (size_t)got)) { close(fd); return 0; }
  }
}

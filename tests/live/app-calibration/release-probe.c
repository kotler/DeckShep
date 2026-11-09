/* Synthetic boundary probe. No Herdr, agent, credentials or external network.
 * Both TCP ports and the outside sentinel are owned by this runner. */
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <mach/mach.h>
#include <servers/bootstrap.h>
#include <stdio.h>
/* Private test-only query; fail closed if unavailable on this OS. */
extern int sandbox_check(pid_t, const char *, int, ...);
#include <stdlib.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
static int connect_port(int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in address = {.sin_len = sizeof(address), .sin_family = AF_INET,
    .sin_port = htons(port), .sin_addr.s_addr = htonl(INADDR_LOOPBACK)};
  int result = connect(fd, (void *)&address, sizeof(address));
  close(fd);
  return result;
}
int main(int argc, char **argv) {
  if (argc != 6) return 2;
  int fd = open(argv[1], O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) return 10;
  close(fd);
  fd = open(argv[2], O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd >= 0) { close(fd); return 11; }
  fd = open(argv[5], O_RDONLY);
  if (fd >= 0) { close(fd); return 12; }
  if (connect_port(atoi(argv[3])) != 0) return 13;
  if (connect_port(atoi(argv[4])) == 0) return 14;
  pid_t child = fork();
  if (child < 0) return 15;
  if (child == 0) { execl("/usr/bin/true", "true", NULL); _exit(errno == EPERM || errno == EACCES ? 0 : 1); }
  int status = 0;
  waitpid(child, &status, 0);
  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) return 16;
  if (sandbox_check(getpid(), "lsopen", 0) == 0) return 17;
  for (int i = 0; i < 1; ++i) {
    mach_port_t service = MACH_PORT_NULL;
    const char *name = "com.apple.coreservices.appleevents";
    if (bootstrap_look_up(bootstrap_port, name, &service) == KERN_SUCCESS) {
      mach_port_deallocate(mach_task_self(), service);
      return 17;
    }
  }
  puts("{\"insideWrite\":true,\"outsideWriteDenied\":true,\"outsideReadDenied\":true,\"feedConnect\":true,\"otherNetworkDenied\":true,\"childExecDenied\":true,\"launchServicesDenied\":true}");
  return 0;
}

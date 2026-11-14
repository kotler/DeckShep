// Disposable input observer for the authorized native deck run. No input injection.
#import <Cocoa/Cocoa.h>
#import <unistd.h>

@interface InputView : NSTextView
@property NSUInteger keyEvents;
@end
@implementation InputView
- (void)keyDown:(NSEvent *)event {
  self.keyEvents++;
  [super keyDown:event];
}
@end

@interface Editor : NSObject <NSApplicationDelegate>
@property (strong) NSWindow *window;
@property (strong) InputView *input;
@property (copy) NSString *report;
@property NSUInteger samples;
@property NSUInteger focusLosses;
@property BOOL observedFocus;
@end
@implementation Editor
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  self.window = [[NSWindow alloc]
      initWithContentRect:NSMakeRect(180, 180, 500, 250)
                styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                  backing:NSBackingStoreBuffered defer:NO];
  self.window.title = @"DeckShep test editor";
  self.input = [[InputView alloc] initWithFrame:self.window.contentView.bounds];
  self.input.string = @"Disposable editor input observer";
  self.window.contentView = self.input;
  [self.window makeKeyAndOrderFront:nil];
  [self.window makeFirstResponder:self.input];
  [NSApp activateIgnoringOtherApps:YES];
  [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self
      selector:@selector(activated:) name:NSWorkspaceDidActivateApplicationNotification
      object:nil];
  [NSTimer scheduledTimerWithTimeInterval:0.02 target:self
      selector:@selector(sample:) userInfo:nil repeats:YES];
}
- (void)activated:(NSNotification *)notification {
  NSRunningApplication *app = notification.userInfo[NSWorkspaceApplicationKey];
  if (self.observedFocus && app.processIdentifier != getpid()) self.focusLosses++;
}
- (void)sample:(NSTimer *)timer {
  pid_t front = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
  BOOL focused = front == getpid() && self.window.isKeyWindow &&
      self.window.firstResponder == self.input;
  if (self.observedFocus && !focused) self.focusLosses++;
  if (focused) self.observedFocus = YES;
  self.samples++;
  NSDictionary *state = @{@"pid": @(getpid()), @"frontmost": @(front),
      @"focused": @(focused), @"samples": @(self.samples),
      @"focusLosses": @(self.focusLosses), @"keyEvents": @(self.input.keyEvents)};
  NSData *data = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
  [data writeToFile:self.report options:NSDataWritingAtomic error:nil];
}
@end

int main(int argc, const char *argv[]) {
  if (argc != 2) return 2;
  @autoreleasepool {
    NSApplication *app = NSApplication.sharedApplication;
    [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    Editor * __attribute__((objc_precise_lifetime)) delegate = [Editor new];
    delegate.report = [NSString stringWithUTF8String:argv[1]];
    app.delegate = delegate;
    [app run];
  }
  return 0;
}

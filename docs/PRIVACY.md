# DeckShep privacy and local processing

DeckShep connects to the user's existing local terminal and coding-agent
interfaces. The plugin has no hosted account or analytics service. It does not
include model usage; provider and terminal applications have their own terms and
data practices.

Local agent discovery and status/control checks process identifiers, project
labels and native state. Some checks read the visible terminal content to verify
that the intended agent and request are still current. Prompt shortcuts can send
user-configured text through the existing agent when its guards and consent
requirements permit it. These local operations should not be described as never
accessing prompt or terminal content.

Optional Rex visible-pane checks temporarily use the clipboard and restore its
formats. Status polling does not use clipboard focus. Optional Claude metadata
hooks and native controls require explicit setup. Fresh installs keep those
integrations, clipboard checks, and Herdr title matching off.

Claude hooks read each event's JSON in memory. DeckShep stores only session,
model and effort captions, process identity, lifecycle epochs and hashed request
digests in a private plugin folder; prompts, assistant messages, tool inputs and
outputs, and transcripts are never stored or logged. DeckShep never changes a
Claude Code or Codex status line. The Codex footer check only reads the pane, and
the only status-line write is restoring your recorded original for older setups,
when you choose removal or **Restore your original status line**.

Preferences, custom configuration, integration setup records and upgrade backups
stay on the Mac. Draft validation retains hashes and identity in memory. Public
diagnostic reports omit prompt/settings contents and home paths. Backup folders
can contain private customizations and should not be shared as support reports.
See [uninstall and cleanup](UNINSTALL.md) for removal.

Public support channels and any distribution-specific privacy notice require
owner review before publication. No support email is active merely because it is
proposed in source. Review diagnostic details before posting to GitHub Issues;
use private vulnerability reporting for security reports once the owner enables it.

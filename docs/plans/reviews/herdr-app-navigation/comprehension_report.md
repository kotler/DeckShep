## What this proposes

The first row will show local Codex and Claude agents in stable slots. The second row lets the user visit the next agent, change banks, close gaps or jump to the agent shown on Attention. With focus consent off, Attention changes the deck selection and bank. With consent and a verified App connection, it can also request the displayed pane once. Both paths check that the displayed agent still needs attention for the same reason.

## How the existing system works, per this document

The experimental preview lists ordinary shells alongside agents and advances Next in the order of Herdr's latest listing. Its badge can follow the deck's choice before Herdr reports a change. The existing App sender can request a pane change, and a separate optional Core connection can supply display details. The preview currently permits certain Codex settings writes when consent, readiness and Core labels agree. This design disables those writes because two different cores can report the same terminal address.

### C1 · Major · Which actions expire when an agent becomes ready? · Lines 85–91, 130, 151

The action table and implementation step 5 require a matching Attention reason only for Attention. The refusal paragraph says an agent becoming ready produces `Press again` without restricting that rule to Attention. A reader following the paragraph would refuse a tap on a Claude tile when Claude finishes waiting, even though the user chose the tile explicitly and it still shows the same agent. State which changes invalidate all three actions and which invalidate only Attention.

### C2 · Major · Consent enabled with an unverified connection · Lines 27–29, 80–87, 91, 134

The journey covers consent off and consent on with a verified sender. Suppose App observations succeed, consent is on and the peer or build cannot be verified before the key is drawn. I can tell that a focus write is unavailable, but cannot tell whether the key offers deck-local navigation, appears inactive or offers a press that will refuse. This determines whether the user can reach the waiting agent's bank and which delivery mode the presentation captures. Distinguish that starting state from losing verification after key-down.

### C3 · Major · Two markers after a successful focus request · Lines 39–41, 93–95, 126, 130, 150

When the request for Claude is acknowledged, Claude gains the deck marker while Codex keeps the App badge. When the next observation reports Claude, the text says to move the App badge and to clear the local choice when the reported selection changes. It introduces clearing with the example of the user changing panes in Herdr. The observation gives no stated way to tell who initiated the change. Specify whether Claude then shows both markers or only the App badge, and what happens when the user subsequently selects a third pane in Herdr.

### C4 · Major · Existing settings controls disappear in this milestone · Lines 31–35, 99–101, 132, 153

The feature description calls provider settings a later milestone and says a saved action stays inactive without the required evidence. Only step 6 explains that the existing preview can already change Model, Effort and Permissions under its prior opt-ins. A preview user reading the feature description could reasonably expect an existing working key to keep working after the upgrade. Name those three actions and describe the visible change alongside the compatibility promise that their saved preferences survive.

### C5 · Nit · Five row-two action IDs for four named actions · Lines 19–25, 74–76, 122

The key map assigns Next, Page, Collapse and Attention and leaves key 4 empty. The implementation twice directs the reader to extract five actions. Identify how the empty fourth position is represented so the reader can reproduce the shared order without inferring a fifth control.

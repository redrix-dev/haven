# Voice overhaul requirements pass

This document tracks implementation coverage for the voice overhaul:

1. Asset paths centralized in shared app asset config and generated outputs.
2. Sidebar voice drawer is primary access point; advanced pane opens from drawer.
3. Voice participant list now supports avatar/name/speaking state shape.
4. Per-member volume controls include persistence and reset controls.
5. Device/transmission/PTT controls remain available in in-channel pane.
6. Voice state hooks retain active channel/session state across navigation changes.
7. Voice sound routing now includes voice event helper in notification sound module.
8. Voice channel title in drawer is navigable to channel context.
9. Desktop IPC boundary now includes modular voice popout calls.
10. Desktop IPC includes global-ish PTT activation bridge for unfocused operation.

# Obsidian Title Match Linker Plugin

## Overview

The Title Match Linker Plugin for Obsidian revolutionizes your note-taking experience by automatically generating wikilinks between your notes. It scans your notes for occurrences of other note titles and transforms them into clickable links. This process not only enhances navigation within your digital notebook but also fosters an interconnected knowledge base.

## Features

- **Automatic Link Creation:** Dynamically generates wikilinks across your notes, enhancing the interconnectedness of your vault.
- **Selective Processing:** Enables customization to exclude specific folders from the link creation process, allowing for targeted note processing.
- **Backup and Review System:** Automatically creates backups of notes and logs changes for safe review, ensuring data integrity.
- **User Control:** Provides options to run the title match link process on individual notes, accept changes, or revert them, offering granular control over content modifications.
- **Smart Performance:** Optimizes operations for large vaults by targeting new or updated content after the initial full vault processing.
- **User Engagement:** Employs confirmations for actions and detailed progress indicators, engaging users throughout the process and ensuring transparency.

## Getting Started

1. **Installation:** Available for installation from Obsidian's community plugin directory.
2. **Configuration:** Visit the plugin settings in the Obsidian settings pane to fine-tune exclusions and other preferences according to your needs.

## Usage

The Title Match Linker Plugin can be used both for processing your entire vault or specific notes, providing flexibility based on your needs:

### Bulk Link Creation

1. **Start the Process:** Activate the plugin through the ribbon icon or command palette. A confirmation dialog ensures that you intentionally initiate the link creation process.
2. **Review and Accept Changes:** After the process completes, review the changes in the generated `ReviewChanges.md` file within the `_tmldata` folder. Accept or revert changes as necessary from the plugin's command palette options.

### Single Note Processing

1. **Context Menu Options:** Right-click on a note to access specific options:
   - **Run Title Match Link:** Initiates the link creation process for the selected note.
   - **Revert Title Match Links:** Available if a backup exists for the note, allowing you to revert to the original content.
   - **Accept Title Match Links:** Accepts the changes made by the plugin, removing the backup and updating the note with the created links.

2. **Review and Cleanup:** Regardless of the method, changes are logged, and backups are created. Review the `ReviewChanges.md` file and the backups in the `_tmlbackups` folder. Use the plugin commands to accept all changes or revert them, which cleans up the backups and change logs.

## Best Practices and Considerations

- **Backup Your Vault:** It's crucial to back up your vault regularly, especially before using new plugins or making bulk changes.
- **Use Exclusions Wisely:** Protect structured notes or specific folders from automatic linking by adding them to the exclusion list in the plugin settings.
- **Review Changes:** Utilize the generated change logs to verify and review link additions or modifications for accuracy.
- **Be Mindful of Storage Space:** Especially for large vaults, the automatic backup process requires additional storage. Be cautious if your device has limited storage space.

## Contribution and Support

Contributions, feedback, and support are welcomed through the project's GitHub repository. Your input helps improve the plugin for everyone in the Obsidian community.

## Disclaimer

While the plugin is designed with safety and data integrity in mind, the creators cannot be held responsible for unintended modifications. Always maintain backups of your important data.

Leverage the power of automated wikilinks with the Obsidian Title Match Linker Plugin, transforming your vault into a richly interconnected knowledge base.

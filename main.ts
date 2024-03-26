import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

/**
 * Defines the settings structure for the TitleMatchLinker plugin.
 */
interface TitleMatchLinkerSettings {
    mySetting: string; // Placeholder for a setting, potentially used for future enhancements.
    excludedFolders: string[]; // List of folder paths to exclude from the link creation process.

}

/**
 * Default settings for the TitleMatchLinker plugin. Applied on initial load or when settings are reset.
 */
const DEFAULT_SETTINGS: TitleMatchLinkerSettings = {
    mySetting: 'default', // Example default value. Adjust based on actual use case.
    excludedFolders: [], // By default, no folders are excluded.
    
};

/**
 * The TitleMatchLinker plugin automatically creates links in notes based on title matches within the Obsidian vault.
 */
export default class TitleMatchLinker extends Plugin {
    settings: TitleMatchLinkerSettings;

    /**
     * Plugin loading lifecycle method. Called when the plugin is loaded by Obsidian.
     */
    async onload() {
        try {
            await this.loadSettings();

            // Adds an icon to the ribbon area that opens the ActionModal when clicked.
            this.addRibbonIcon('links-coming-in', 'Title Match Linker Options', () => {
                new ActionModal(this.app, this).open();
            });

            // Adds a settings tab for the plugin in the Obsidian settings view.
            this.addSettingTab(new SettingTab(this.app, this));

            // Initializes commands for user interaction.
            this.initializeCommands();
        } catch (error) {
            console.error('Failed to load the TitleMatchLinker plugin:', error);
            new Notice('There was an issue loading the TitleMatchLinker plugin. Check the console for details.');
        }
    }

    /**
     * Initializes commands for user interaction with the plugin.
     */
    initializeCommands() {
        // Command to start the link creation process manually.
        this.addCommand({
            id: 'start-link-creation',
            name: 'Start Link Creation',
            callback: async () => {
                const canProceed = await this.canProceedWithLinkCreation();
                if (canProceed) {
                    this.startLinkCreationProcess();
                } else {
                    new Notice('Cannot start the link creation process. Check for pending changes.');
                }
            }
        });

        // Add an option to the file context menu for running title match link on a single note
        this.app.workspace.on('file-menu', (menu, file) => {
            // Check if the clicked item is a markdown file
            if (file instanceof TFile && file.extension === 'md') {
                menu.addItem((item) => {
                    item.setTitle('Run Title Match Link')
                        .setIcon('link') // Choose an appropriate icon
                        .onClick(async () => {
                            // Run the link process for the selected note
                            await this.linkSingleNote(file);
                        });
                });
            }
        });

                /**
         * Registers an event listener for the file context menu within the Obsidian workspace.
         * This listener adds a "Revert Title Match Links" option to markdown files if a backup file exists,
         * indicating changes were made by the Title Match Linker plugin. Selecting this option allows users to revert these changes.
         */
        this.app.workspace.on('file-menu', (menu, file) => {
            // Check if the file is a markdown file.
            if (file instanceof TFile && file.extension === 'md') {
                // Construct the path for the potential backup file using the flattened file name.
                // This follows the naming convention used by the plugin for backup files.
                const flattenedBackupFileName = `SNC-${file.path.replace(/\//g, '__')}.bak`;
                const backupPath = `_tmlbackups/${flattenedBackupFileName}`;

                // Attempt to find the backup file in the vault.
                const backupFile = this.app.vault.getAbstractFileByPath(backupPath);

                // If the backup file exists, add the "Revert Title Match Links" option to the file's context menu.
                if (backupFile instanceof TFile) {
                    menu.addItem((item) => {
                        item.setTitle('Revert Title Match Links')
                            .setIcon('reset') // Set an appropriate icon for the menu item.
                            .onClick(async () => {
                                // Revert changes for this specific file using the plugin's functionality.
                                await this.revertSingleNote(file);

                                // Notify the user that the revert operation has been completed.
                                new Notice(`Changes reverted for "${file.name}".`);
                            });
                    });
                }
            }
        });


                /**
         * Registers an event listener for the file context menu within the Obsidian workspace.
         * This listener adds a custom menu item to markdown files, allowing users to accept changes made by the Title Match Linker plugin.
         * Accepting changes involves deleting the backup file and performing cleanup operations, such as removing now-empty folders.
         */
        this.app.workspace.on('file-menu', (menu, file) => {
            // Ensure the menu item is added only for markdown files.
            if (file instanceof TFile && file.extension === 'md') {
                // Construct the path for a potential backup file based on a naming convention.
                const flattenedBackupFileName = `SNC-${file.path.replace(/\//g, '__')}.bak`;
                const backupPath = `_tmlbackups/${flattenedBackupFileName}`;

                // Attempt to retrieve the backup file from the vault.
                const backupFile = this.app.vault.getAbstractFileByPath(backupPath);

                // If a backup file exists, it indicates that changes were made to this file using the plugin.
                if (backupFile instanceof TFile) {
                    // Add an option to the context menu for accepting the title match links.
                    menu.addItem((item) => {
                        item.setTitle('Accept Title Match Links')
                            .setIcon('checkmark') // Sets an icon for the menu item (choose an appropriate icon).
                            .onClick(async () => {
                                // Perform cleanup operations after accepting changes.
                                // This includes deleting the backup file and the change log file, and possibly removing empty folders.
                                await this.cleanupAfterReversionOrAcceptance(file.path);

                                // Notify the user that changes have been accepted and cleanup is complete.
                                new Notice(`Changes accepted for "${file.name}". Cleanup completed.`);
                            });
                    });
                }
            }
        });

            
        // Register the plugin command.
        this.addCommand({
            id: 'link-notes',
            name: 'Link Notes',
            callback: () => {
                this.linkNotes();
            }
        });



        // Command for users to revert all changes made by the plugin.
        this.addCommand({
            id: 'revert-changes',
            name: 'Revert Changes',
            callback: () => {
                new ConfirmationModal(this.app, "Are you sure you want to revert all changes? This cannot be undone.", () => {
                    this.revertChanges();
                }).open();
            }
        });

        // Command for users to accept all changes and delete backup files.
        this.addCommand({
            id: 'accept-all-changes',
            name: 'Accept All Changes',
            callback: () => {
                new ConfirmationModal(this.app, "Are you sure you want to accept all changes and delete backup files? This cannot be undone.", () => {
                    this.acceptAllChanges();
                }).open();
            }
        });
    }

/**
 * Initiates the process of linking notes based on title matches.
 * This function scans all markdown files within the vault, excluding specified folders,
 * to automatically create links for titles that match other note titles.
 */
async linkNotes() {
    // Ensure the backup folder exists for storing original files before modification.
    const backupFolder = "_tmlbackups";
    await this.ensureSpecialFolderExists(backupFolder);

    // Retrieve all markdown files not in excluded folders.
    const files = this.app.vault.getMarkdownFiles().filter(file => 
        !this.settings.excludedFolders.some(folder => 
            file.path.startsWith(folder))
    );

    // If no files are eligible for processing, notify the user and exit the function.
    if (files.length === 0) {
        new Notice("No files to process.");
        return;
    }

    // Initialization of counters for UI feedback.
    let filesToModify = 0;
    let totalLinksAddedCount = 0;
    const changeDetails = []; // Collects detailed information for review.

    // Show progress to the user via a modal dialog.
    const progressModal = new ProgressModal(this.app, files.length, 'linkCreation');
    progressModal.open();

    for (const file of files) {
        try {
            const originalContent = await this.app.vault.read(file);
            const { content: modifiedContent, linksAdded } = this.processContent(originalContent, files, file.basename);

            // If links were added, proceed with creating backups and modifying the file.
            if (linksAdded > 0) {
                const flattenedBackupFileName = file.path.replace(/\//g, '__') + '.bak';
                const backupPath = `${backupFolder}/${flattenedBackupFileName}`;

                try {
                    // Attempt to create a backup before modifying the file.
                    await this.app.vault.adapter.write(backupPath, originalContent);
                } catch (backupError) {
                    console.error(`Error creating backup for ${file.path}:`, backupError);
                    new Notice(`Error creating backup for ${file.name}. Check console for details.`);
                    continue; // Skip this file if a backup cannot be created.
                }

                try {
                    // Modify the original file with added links.
                    await this.app.vault.modify(file, modifiedContent);
                    filesToModify++;
                    totalLinksAddedCount += linksAdded;

                    // Record change details for later review.
                    changeDetails.push({
                        filePath: file.path,
                        modifiedContent,
                        linksAdded,
                        fileName: file.name
                    });
                } catch (modifyError) {
                    console.error(`Error modifying ${file.path}:`, modifyError);
                    new Notice(`Error modifying ${file.name}. Check console for details.`);
                }
            }
        } catch (readError) {
            console.error(`Error reading ${file.path}:`, readError);
            new Notice(`Error reading ${file.name}. Check console for details.`);
        }
        // Update the progress modal after processing each file.
        progressModal.updateProgress(file.name);
    }

    // Close the progress modal and notify the user upon completion.
    progressModal.completeProcess();
    new Notice(`Link creation process completed: ${totalLinksAddedCount} links added across ${filesToModify} notes.`);

    // If changes were made, append them to a markdown file for review.
    if (changeDetails.length > 0) {
        await this.appendToReviewChangesMarkdown(changeDetails);
    }
}

/**
 * Processes a single note for title match linking.
 * This method ensures necessary folders for backups and logging exist, checks if the note is within an excluded folder,
 * creates a backup of the original content, processes the note for title match linking, logs changes for review,
 * and cleans up unnecessary backup files if no links are added.
 * 
 * @param {TFile} file The note file to process.
 */
async linkSingleNote(file: TFile) {
    // Ensure backup and logging folders exist.
    await this.ensureSpecialFolderExists("_tmlbackups");
    await this.ensureSpecialFolderExists("_tmldata");

    // Skip processing for files in excluded folders.
    if (this.settings.excludedFolders.some(folder => file.path.startsWith(folder))) {
        console.log(`Skipping "${file.name}": located in an excluded folder.`);
        new Notice(`Skipping "${file.name}": located in an excluded folder.`);
        return;
    }

    // Read the original content of the file.
    const originalContent = await this.app.vault.read(file);

    // Use a compact naming convention for backup files for brevity.
    const flattenedBackupFileName = `SNC-${file.path.replace(/\//g, '__')}.bak`;
    const backupPath = `_tmlbackups/${flattenedBackupFileName}`;

    // Create a backup of the original content.
    await this.app.vault.create(backupPath, originalContent).catch(error => {
        console.error(`Failed to create backup for "${file.name}":`, error);
        new Notice(`Error creating backup for "${file.name}". Check console for details.`);
        return;
    });

    // Retrieve all markdown files, excluding the current file and those in excluded folders.
    const allFiles = this.app.vault.getMarkdownFiles().filter(otherFile => 
        otherFile !== file && !this.settings.excludedFolders.some(folder => otherFile.path.startsWith(folder))
    );

    // Process the file for title match linking.
    const { content: modifiedContent, linksAdded } = this.processContent(originalContent, allFiles, file.basename);

    if (linksAdded > 0) {
        // Update the file with the modified content if links were added.
        await this.app.vault.modify(file, modifiedContent);
        
        // Generate a log file with the changes made.
        const logFileName = `SNC-Changes-${file.path.replace(/\//g, '__')}.md`;
        const logFilePath = `_tmldata/${logFileName}`;
        const logContent = `# Links Added to ${file.name}\n\n- ${linksAdded} links added.\n\n---\n\n${modifiedContent}`;

        await this.app.vault.create(logFilePath, logContent).catch(error => {
            console.error(`Failed to log changes for "${file.name}":`, error);
            new Notice(`Error logging changes for "${file.name}". Check console for details.`);
        });

        // Notify the user about the links added and the location of the change log.
        new Notice(`${linksAdded} links added to "${file.name}". Review changes in "${logFilePath}".`);
    } else {
        // If no links were added, delete the backup file and notify the user.
        const backupFile = this.app.vault.getAbstractFileByPath(backupPath);
        if (backupFile instanceof TFile) {
            await this.app.vault.delete(backupFile);
            new Notice(`No links added to "${file.name}". Backup not needed and deleted.`);
        } else {
            console.error(`Backup file not found: ${backupPath}`);
            new Notice(`No links added to "${file.name}". Error finding backup file for deletion.`);
        }
    }
}
    
/**
 * Reverts changes made to a single note by restoring its content from a backup file.
 * This function looks for the backup file using a naming convention, restores the note's content if a backup is found,
 * and notifies the user about the outcome of the reversion process.
 * 
 * @param {TFile} file The note file to revert changes for.
 */
/**
 * Reverts changes made to a single note by restoring its content from a backup file.
 * - Locates the backup file using a naming convention based on the note's path.
 * - Restores the note's content from the backup if found.
 * - Notifies the user about the success or failure of the reversion process.
 * - Cleans up backup and change log files, and removes empty special folders.
 * 
 * @param {TFile} file The note file to revert changes for.
 */
async revertSingleNote(file: TFile) {
    // Use the flattened naming convention to locate the backup file.
    const flattenedBackupFileName = `SNC-${file.path.replace(/\//g, '__')}.bak`;
    const backupPath = `_tmlbackups/${flattenedBackupFileName}`;

    // Attempt to locate the backup file within the _tmlbackups folder.
    const backupFile = this.app.vault.getAbstractFileByPath(backupPath);
    if (backupFile instanceof TFile) {
        try {
            // Read the backup file's content.
            const backupContent = await this.app.vault.read(backupFile);
            // Restore the original file with the backup content.
            await this.app.vault.modify(file, backupContent);
            // Notify the user of successful reversion.
            new Notice(`"${file.name}" has been reverted to its previous state.`);
            // Clean up after successful reversion.
            await this.cleanupAfterReversionOrAcceptance(file.path);
        } catch (error) {
            console.error(`Error reverting "${file.name}":`, error);
            new Notice(`Error reverting "${file.name}". See console for details.`);
        }
    } else {
        // Notify the user if the backup file is not found.
        new Notice(`Backup not found for "${file.name}". Reversion not possible.`);
    }
}

    
    /**
 * Appends details of the changes made during the link creation process to a Markdown file for review.
 * This allows users to manually verify and adjust the automated changes if necessary.
 * 
 * @param {Array} changes - An array of objects detailing each change, including the file path,
 * modified content, number of links added, and the file name.
 */
async appendToReviewChangesMarkdown(changes: { filePath: string, modifiedContent: string, linksAdded: number, fileName: string }[]) {
    const logFolderPath = "_tmldata";
    const logFileName = "ReviewChanges.md";
    const logFilePath = `${logFolderPath}/${logFileName}`;
    
    // Initialize log content with a header.
    let logContent = "# Review Changes\n\n";
    
    // Append each change to the log content in Markdown format.
    changes.forEach(change => {
        logContent += `- ${change.filePath}: ${change.linksAdded} links added to [[${change.fileName}]].\n`;
    });
    
    // Ensure the log folder exists.
    await this.ensureSpecialFolderExists(logFolderPath);
    
    try {
        // Attempt to read existing content of the review changes log file.
        let existingContent = "";
        try {
            existingContent = await this.app.vault.read(this.app.vault.getAbstractFileByPath(logFilePath) as TFile);
        } catch (e) {
            // If the file does not exist, log a message and proceed to create a new one.
            console.log("ReviewChanges.md does not exist, creating a new one.");
        }
        
        // Write or append the new log content to the ReviewChanges.md file.
        await this.app.vault.adapter.write(logFilePath, existingContent + logContent);
        
        // Notify the user that the review changes have been recorded.
        new Notice("Review changes have been recorded.");
    } catch (error) {
        // Log and notify the user in case of any errors during the file write operation.
        console.error("Failed to write to ReviewChanges.md:", error);
        new Notice("An error occurred while recording review changes. Check console for details.");
    }
}

    
    

    /**
 * Determines if the link creation process can proceed based on current vault state.
 * Checks for existing backup files to prevent overwriting unreviewed changes.
 * Also checks the user's exclusion list settings.
 * 
 * @returns {Promise<boolean>} True if link creation can proceed, otherwise false.
 */
async canProceedWithLinkCreation(): Promise<boolean> {
    // Check for existing backup files.
    const backupFolderExists = await this.app.vault.adapter.exists("_tmlbackups");
    const backupFiles = backupFolderExists ? await this.app.vault.adapter.list("_tmlbackups") : { files: [] };
    if (backupFiles.files.length > 0) {
        new Notice("Please accept or revert current changes before running the process again.");
        return false;
    }

    // Check user settings for excluded folders.
    const autoExcludedFolders = ["_tmlbackups", "_tmldata"];
    const additionalExcludedFolders = this.settings.excludedFolders.filter(folder => !autoExcludedFolders.includes(folder));
    if (additionalExcludedFolders.length === 0) {
        // Request explicit confirmation if no additional folders are excluded.
        return new Promise((resolve) => {
            new ConfirmationModal(this.app, "You have not added any additional folders to the exclusion list. Are you sure you want to proceed?", () => resolve(true), () => resolve(false)).open();
        });
    }

    return true;
}

/**
 * Initiates the link creation process, preceded by user confirmation.
 * Warns if no folders are excluded to minimize unintended changes.
 */
startLinkCreationProcess() {
    // Check if any folders are excluded in the settings.
    if (this.settings.excludedFolders.length === 0) {
        new Notice("Warning: No folders are excluded. Consider adding folders to the exclusion list in settings to avoid unintended changes.");
    } else {
        // Confirm with the user before starting the link creation process.
        new ConfirmationModal(this.app, "Are you sure you want to start the link creation process?", async () => {
            const canProceed = await this.canProceedWithLinkCreation();
            if (canProceed) {
                this.linkNotes();
            }
        }).open();
    }
}

/**
 * Allows the user to accept all changes made by the plugin.
 * This action will delete all backup files, signifying that the user has reviewed and accepted all modifications.
 */
acceptAllChanges() {
    // Enhanced confirmation modal to inform the user about the implications of their choices.
    const message = `Are you sure you want to accept all changes? This will delete all backup files in the _tmlbackups folder. 
    Do you also want to delete the _tmldata folder? 
    Keeping the _tmldata folder allows you to review the 'ReviewChanges.md' file, which lists all automated link creations for future reference or auditing.`;

    new ExtendedConfirmationModal(this.app, message, async (alsoDeleteData) => {
        try {
            // Always delete the _tmlbackups folder.
            await this.deleteFolderAndContents("_tmlbackups");
            
            // Conditionally delete the _tmldata folder based on the user's choice.
            if (alsoDeleteData) {
                await this.deleteFolderAndContents("_tmldata");
                new Notice("All changes accepted. Backup and data folders deleted.");
            } else {
                // Inform the user that the _tmldata folder is retained for review.
                new Notice("All changes accepted. Backup folder deleted. The _tmldata folder is retained for your review.");
            }
        } catch (error) {
            console.error("Error during the acceptance of changes:", error);
            new Notice("An error occurred while accepting changes. Check the console for details.");
        }
    }).open();
}

    

/**
 * Cleans up after the reversion or acceptance of changes for a single note.
 * This involves deleting the backup file and the change log file associated with the note.
 * If the _tmlbackups and _tmldata folders become empty as a result, they are also deleted.
 * The user is notified after each successful deletion.
 *
 * @param {string} filePath - The path of the file for which changes were reverted or accepted.
 */
async cleanupAfterReversionOrAcceptance(filePath: string) {
    // Replace slashes with underscores to create a flattened file name.
    // This is used to construct the backup and change log file paths.
    const flattenedFileName = filePath.replace(/\//g, '__');
    
    // Construct paths for the backup and change log files using the flattened file name.
    const backupPath = `_tmlbackups/SNC-${flattenedFileName}.bak`;
    const changeLogPath = `_tmldata/SNC-Changes-${flattenedFileName}.md`;

    // Attempt to delete the backup file and notify the user.
    const backupFile = this.app.vault.getAbstractFileByPath(backupPath);
    if (backupFile instanceof TFile) {
        await this.app.vault.delete(backupFile)
            .then(() => new Notice(`Backup file deleted: ${backupPath}`))
            .catch(error => {
                console.error(`Error deleting backup file: ${backupPath}`, error);
                new Notice(`Error deleting backup file: ${backupPath}. Check console for details.`);
            });
    }

    // Attempt to delete the change log file and notify the user.
    const changeLogFile = this.app.vault.getAbstractFileByPath(changeLogPath);
    if (changeLogFile instanceof TFile) {
        await this.app.vault.delete(changeLogFile)
            .then(() => new Notice(`Change log file deleted: ${changeLogPath}`))
            .catch(error => {
                console.error(`Error deleting change log file: ${changeLogPath}`, error);
                new Notice(`Error deleting change log file: ${changeLogPath}. Check console for details.`);
            });
    }

    // Check if the _tmlbackups and _tmldata folders are empty and delete them if they are.
    // This is done by checking if there are no files or folders within them.
    await Promise.all(['_tmlbackups', '_tmldata'].map(async (folderName) => {
        const folder = this.app.vault.getAbstractFileByPath(folderName);
        if (folder instanceof TFolder) {
            const contents = await this.app.vault.adapter.list(folder.path);
            if (contents.files.length === 0 && contents.folders.length === 0) {
                // Use the folder's path with the deleteFolderAndContents function to delete the folder.
                await this.deleteFolderAndContents(folder.path)
                    .then(() => new Notice(`Deleted empty folder: ${folderName}`))
                    .catch(error => {
                        console.error(`Error deleting folder: ${folderName}`, error);
                        new Notice(`Error deleting folder: ${folderName}. Check console for details.`);
                    });
            }
        }
    }));
}




    
    
    /**
 * Ensures a specified folder exists within the Obsidian vault. If the folder doesn't exist, it's created.
 * Additionally, the folder is added to the plugin's list of excluded folders to prevent processing files within it.
 * 
 * @param {string} folderPath The path of the folder to check or create.
 */
async ensureSpecialFolderExists(folderPath: string) {
    try {
        // Check if the special folder already exists; if not, create it.
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }

        // Ensure the special folder is in the list of excluded folders.
        if (!this.settings.excludedFolders.includes(folderPath)) {
            this.settings.excludedFolders.push(folderPath);
            await this.saveSettings(); // Save the updated settings.
            new Notice(`${folderPath} folder has been added to the excluded folders.`);
        }
    } catch (error) {
        console.error(`Failed to ensure the special folder exists or update settings for ${folderPath}:`, error);
        new Notice(`An error occurred while setting up the ${folderPath} folder. Check console for details.`);
    }
}

/**
 * Sanitizes the content of a note by marking the lines contained within front matter blocks or code blocks.
 * This is used to avoid processing these lines when creating links.
 * 
 * @param {string} originalContent The original content of the note.
 * @returns An object containing the sanitized content and flags for front matter and code blocks.
 */
frontMatterAndCodeBlockSanitizer(originalContent: string): { sanitizedContent: string, frontMatter: boolean[], codeBlocks: boolean[] } {
    const lines = originalContent.split('\n');
    let inFrontMatter = lines[0].trim() === '---';
    let inCodeBlock = false;
    const frontMatterFlags: boolean[] = [];
    const codeBlockFlags: boolean[] = [];

    lines.forEach((line, index) => {
        if (inFrontMatter && line.trim() === '---' && index !== 0) {
            inFrontMatter = !inFrontMatter;
        } else if (!inFrontMatter && index === 0 && line.trim() === '---') {
            inFrontMatter = true;
        }

        if (!inFrontMatter && line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        frontMatterFlags.push(inFrontMatter);
        codeBlockFlags.push(inCodeBlock);
    });

    return { sanitizedContent: lines.join('\n'), frontMatter: frontMatterFlags, codeBlocks: codeBlockFlags };
}

/**
 * Sanitizes note content by identifying lines that contain links and should not be processed for link creation.
 * This helps to prevent the creation of links within existing links.
 * 
 * @param {string} content The content to sanitize.
 * @returns An object with the original content and a flag array indicating lines with links.
 */
linkSanitizer(content: string): { sanitizedContent: string, inLinkFlags: boolean[] } {
    const lines = content.split('\n');
    const inLinkFlags: boolean[] = new Array(lines.length).fill(false);

    // Define regex for Markdown links and plain URLs.
    const markdownLinkRegex = /\[([^\]]+?)\]\((https?:\/\/[^\s)]+?)\)/g;
    const urlRegex = /https?:\/\/\S+/g;

    lines.forEach((line, i) => {
        // Initialize hasLink to false for each line.
        let hasLink = false;

        // Test the current line for Markdown links.
        if (markdownLinkRegex.test(line)) {
            hasLink = true;
        }
        // If no Markdown link was found, test for plain URLs.
        else if (urlRegex.test(line)) {
            hasLink = true;
        }

        // Update the flag for the current line.
        inLinkFlags[i] = hasLink;

        // Reset regex indices (necessary because test() and exec() methods affect lastIndex).
        markdownLinkRegex.lastIndex = 0;
        urlRegex.lastIndex = 0;
    });

    return { sanitizedContent: content, inLinkFlags };
}


    
    

    /**
 * Processes the content of a note to automatically create links based on matching titles in the vault.
 * Sanitizes the content first to exclude front matter, code blocks, and existing links.
 *
 * @param {string} originalContent - The original content of the note to process.
 * @param {TFile[]} files - An array of all markdown files in the vault for title comparison.
 * @param {string} currentBasename - The basename of the current note to avoid self-linking.
 * @returns An object containing the processed content and the total number of links added.
 */
processContent(originalContent: string, files: TFile[], currentBasename: string): { content: string, linksAdded: number } {
    // Step 1: Sanitize content for front matter and code blocks.
    const { sanitizedContent, frontMatter, codeBlocks } = this.frontMatterAndCodeBlockSanitizer(originalContent);
    
    // Step 2: Sanitize content for existing links to avoid nesting links.
    const { sanitizedContent: contentAfterLinkSanitization, inLinkFlags } = this.linkSanitizer(sanitizedContent);
    
    let totalLinksAdded = 0;
    const contentAfterProcessing: string[] = [];
    
    // Process each line individually, considering the sanitization flags.
    contentAfterLinkSanitization.split('\n').forEach((line, i) => {
        if (!frontMatter[i] && !codeBlocks[i] && !inLinkFlags[i]) {
            // Line is eligible for link processing.
            const { modifiedLine, linksAdded } = this.processLineForLinking(line, files, currentBasename);
            totalLinksAdded += linksAdded;
            contentAfterProcessing.push(modifiedLine);
        } else {
            // Line should remain unaltered.
            contentAfterProcessing.push(line);
        }
    });
    
    return { content: contentAfterProcessing.join('\n'), linksAdded: totalLinksAdded };
}

/**
 * Processes a single line of content to replace matching note titles with wiki-style links.
 *
 * @param {string} line - The current line of text being processed.
 * @param {TFile[]} files - An array of all markdown files in the vault for title comparison.
 * @param {string} currentBasename - The basename of the current note to avoid self-linking.
 * @returns An object containing the modified line and the number of links added within that line.
 */
processLineForLinking(line: string, files: TFile[], currentBasename: string): {modifiedLine: string, linksAdded: number} {
    let modifiedLine = line;
    let linksAdded = 0;
    
    // Convert file basenames to lowercase for case-insensitive comparison.
    files.map(f => f.basename.toLowerCase()).forEach(title => {
        if (currentBasename.toLowerCase() !== title) {
            // Escaping special characters in title for use in regular expression.
            const sanitizedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?<!\\[\\[|\\]\\()\\b${sanitizedTitle}\\b(?!\\]\\]|\\([^)]*\\))`, 'gi');
            
            // Check if the current line contains the title.
            const matches = line.match(regex);
            if (matches) {
                // Replace occurrences of the title with markdown links.
                modifiedLine = modifiedLine.replace(regex, `[[${title}]]`);
                linksAdded += matches.length;
            }
        }
    });

    return { modifiedLine, linksAdded };
}
    /**
 * Asynchronously loads the plugin settings from the Obsidian data storage.
 * Postpones the check for the existence of excluded folders to ensure the vault is fully loaded.
 * This delay helps in avoiding false negatives where folders might not yet be indexed by Obsidian at the time of check.
 */
async loadSettings() {
    console.log("[TitleMatchLinker] Loading settings...");
    
    // Attempt to load settings with a fallback to default settings if none are found.
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    console.log("[TitleMatchLinker] Loaded settings:", JSON.stringify(this.settings, null, 2));

    // Delay checking for the existence of folders specified in the excludedFolders setting.
    setTimeout(async () => {
        // Filter for folders that do not exist in the vault.
        const nonExistentFolders = this.settings.excludedFolders.filter(folder => !(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder));
        
        if (nonExistentFolders.length > 0) {
            console.log(`[TitleMatchLinker] Non-existent folders detected in settings: ${nonExistentFolders.join(', ')}`);
            // Notify the user about non-existent folders requiring review.
            new Notice(`The following folders do not exist and may need to be reviewed: ${nonExistentFolders.join(', ')}`);
        }
    }, 5000); // 5-second delay to accommodate vault loading times.
}

/**
 * Asynchronously saves the current settings to the Obsidian data storage.
 * This method encapsulates the save operation with error handling to ensure stability.
 */
async saveSettings() {
    try {
        await this.saveData(this.settings);
        console.log("[TitleMatchLinker] Settings successfully saved.");
    } catch (error) {
        console.error("[TitleMatchLinker] Failed to save settings:", error);
        new Notice("Failed to save plugin settings. Check console for details.");
    }
}


    /**
 * Reverts changes made to notes by restoring content from backup files.
 * Upon successful reversion, it also deletes the backup files and the ReviewChanges.md log.
 */
async revertChanges() {
    const backupFolder = "_tmlbackups";
    // Retrieve all backup files within the specified folder.
    const backupFiles = await this.app.vault.getFiles().filter(file => file.path.startsWith(backupFolder + "/") && file.extension === "bak");

    if (backupFiles.length === 0) {
        new Notice("No backup files found to revert.");
        return;
    }

    // Display a progress modal to inform the user about the reversion progress.
    const progressModal = new ProgressModal(this.app, backupFiles.length, 'reversion');
    progressModal.open();

    for (const backupFile of backupFiles) {
        try {
            // Derive the original file path from the backup file's name.
            const flattenedFilename = backupFile.path.substring(backupFolder.length + 1);
            const originalFilePath = flattenedFilename.replace(/__/g, '/').replace('.bak', '');
            const originalFile = await this.app.vault.getAbstractFileByPath(originalFilePath);

            if (originalFile instanceof TFile) {
                // Read the backup file and restore its content to the original file.
                const originalContent = await this.app.vault.read(backupFile);
                await this.app.vault.modify(originalFile, originalContent);
                // Delete the backup file after successful restoration.
                await this.app.vault.delete(backupFile);
            } else {
                throw new Error(`Original file not found for backup: ${backupFile.path}`);
            }

            // Update the progress modal after processing each backup file.
            progressModal.updateProgress(backupFile.name);
        } catch (error) {
            console.error("Error reverting file from backup", error);
            new Notice(`Error reverting file: ${backupFile.name}. Check console for details.`);
        }
    }

    // Attempt to delete the ReviewChanges.md log if it exists.
    try {
        const reviewChangesPath = "_tmldata/ReviewChanges.md";
        const reviewChangesFile = this.app.vault.getAbstractFileByPath(reviewChangesPath);
        if (reviewChangesFile instanceof TFile) {
            await this.app.vault.delete(reviewChangesFile);
            new Notice("ReviewChanges.md log has been deleted.");
        }
    } catch (error) {
        console.error("Error deleting ReviewChanges.md log", error);
        new Notice("Error deleting ReviewChanges.md log. Check console for details.");
    }

    // Close the progress modal and notify the user upon completion.
    progressModal.completeProcess();
    new Notice("Reversion process completed.");
}

/**
 * Deletes a specified folder and all its contents from the vault.
 * This is a recursive operation, meaning that all nested files and subfolders are also removed.
 * It's used to clean up folders like _tmlbackups and _tmldata after their contents are no longer needed.
 *
 * @param {string} folderPath The path to the folder that should be deleted.
 * @throws {Error} Throws an error if the deletion fails, including a descriptive message.
 */
async deleteFolderAndContents(folderPath: string) {
    // Retrieve the folder object from the vault using the provided path.
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    // Check if the folder exists and is indeed a folder (and not a file).
    if (folder instanceof TFolder) {
        try {
            // Recursively delete the folder and its contents. The 'true' parameter
            // indicates that the deletion should include all nested items.
            await this.app.vault.delete(folder, true);
        } catch (error) {
            // If an error occurs during deletion, encapsulate it in a more descriptive error message.
            // This ensures that the error log provides clear context about the operation that failed.
            throw new Error(`Failed to delete folder ${folderPath}: ${error}`);
        }
    }
}

    
    
    

    /**
 * Asynchronously deletes all backup files (.bak) located in the designated backup folder.
 * This method is designed to clean up after the reversion or acceptance of changes,
 * ensuring that old backups do not clutter the vault.
 */
    async deleteBackupFiles() {
    const backupFolder = "_tmlbackups"; // Define the backup folder path.
    
    try {
        // Retrieve all .bak files from the backup folder.
        const backupFiles = this.app.vault.getFiles().filter(file => file.path.startsWith(`${backupFolder}/`) && file.extension === "bak");
        
        // Check if there are any backup files to delete.
        if (backupFiles.length === 0) {
            new Notice("No backup files found to delete."); // Inform the user if no backup files are found.
            return; // Exit the method early if there are no files to delete.
        }
        
        // Delete each backup file found in the folder.
        for (const file of backupFiles) {
            await this.app.vault.delete(file); // Asynchronously delete the file.
        }
        
        // Notify the user upon successful deletion of all backup files.
        new Notice("All backup files have been successfully deleted.");
        } catch (error) {
            // Log and notify the user of any errors encountered during the deletion process.
            console.error("Error deleting backup files", error);
            new Notice("An error occurred while trying to delete backup files. Check the console for more details.");
        }
    }
}


    

/**
 * Custom modal class for displaying progress information during long-running operations.
 * It supports showing the total number of notes processed, a progress bar, and an estimated time to completion.
 */
class ProgressModal extends Modal {
    totalNotes: number;
    processedNotes = 0;
    progressBar: HTMLElement;
    statusText: HTMLElement;
    operationType: string; // Indicates the type of operation ('linkCreation' or 'reversion').
    startTime: Date; // Tracks the start time for estimating time remaining.
    estimatedTimeText: HTMLElement; // Displays estimated time remaining to the user.

    constructor(app: App, totalNotes: number, operationType: string) {
        super(app);
        this.totalNotes = totalNotes;
        this.operationType = operationType;
        this.startTime = new Date(); // Initialize the start time upon creation.
    }

    /**
     * Sets up the modal's UI elements when it's opened.
     */
    onOpen() {
        const contentEl = this.contentEl;
        contentEl.empty(); // Clear existing content.

        // Dynamic title based on operation type.
        const titleText = this.operationType === 'linkCreation' ? 'Link Creation Progress' : 'Reversion Progress';
        contentEl.createEl('h2', { text: titleText });

        // Progress bar setup.
        const progressContainer = contentEl.createEl('div', {
            attr: { style: 'width: 100%; background-color: #ddd;' }
        });
        this.progressBar = progressContainer.createEl('div', {
            attr: { style: 'height: 20px; width: 0%; background-color: #2196F3;' }
        });

        // Initializing status text.
        this.statusText = contentEl.createEl('p', { text: 'Initializing...' });

        // Element for displaying the estimated time remaining.
        this.estimatedTimeText = contentEl.createEl('p', { text: 'Estimated time remaining: Calculating...' });

        // Button to allow the modal to be closed while the process continues in the background.
        const runInBackgroundButton = contentEl.createEl('button', { text: 'Run in Background' });
        runInBackgroundButton.addEventListener('click', () => {
            new Notice('Process will continue in the background.');
            this.close();
        });
    }

    /**
     * Updates the progress bar and text based on the number of notes processed.
     * Calculates and displays the estimated time remaining until completion.
     * 
     * @param {string} noteName - The name of the currently processed note.
     */
    updateProgress(noteName: string) {
        this.processedNotes++;
        const progressPercentage = (this.processedNotes / this.totalNotes) * 100;
        this.progressBar.style.width = `${progressPercentage}%`;
        this.statusText.textContent = `Processing ${noteName} (${this.processedNotes}/${this.totalNotes})`;

        // Calculate and update estimated time remaining.
        const timeElapsed = (new Date().getTime() - this.startTime.getTime()) / 1000; // in seconds
        const estimatedTotalTime = timeElapsed / (this.processedNotes / this.totalNotes);
        const estimatedTimeRemaining = estimatedTotalTime - timeElapsed;
        const remainingMinutes = Math.floor(estimatedTimeRemaining / 60);
        const remainingSeconds = Math.floor(estimatedTimeRemaining % 60);
        this.estimatedTimeText.textContent = `Estimated time remaining: ${remainingMinutes} minutes, ${remainingSeconds} seconds`;
    }

    /**
     * Finalizes the modal's display when the process is completed.
     * Clears the estimated time text and closes the modal after a short delay.
     */
    completeProcess() {
        this.statusText.textContent = 'Process completed.';
        this.estimatedTimeText.textContent = 'All operations are finished.'; // Update to reflect completion status.
        setTimeout(() => this.close(), 2000); // Close the modal after a 2-second delay.
    }
}




/**
 * A modal that provides options for link creation, reverting changes, and accepting all changes.
 * It allows users to interact with the plugin's core functionalities directly from the UI.
 */
class ActionModal extends Modal {
    plugin: TitleMatchLinker;

    constructor(app: App, plugin: TitleMatchLinker) {
        super(app);
        this.plugin = plugin;
    }

    /**
     * Sets up the modal's content when it's opened, including buttons for various actions.
     */
    onOpen() {
        this.contentEl.createEl('h2', { text: 'Title Link Options' });

        // Helper function to create buttons with descriptive text.
        const createButtonWithDescription = (buttonText: string, descriptionText: string, onClickCallback: () => void) => {
            const buttonWrapper = this.contentEl.createDiv({ cls: 'action-button-wrapper' });
            const button = buttonWrapper.createEl('button', { text: buttonText, cls: 'mod-cta' });
            button.addEventListener('click', onClickCallback);

            // Directly set the description text on a new div element without using a redundant variable.
            buttonWrapper.createEl('div', { text: descriptionText, cls: 'action-button-description' });
        };

        // Button to initiate the link creation process.
        createButtonWithDescription('Start Link Creation', 'Initiates the link creation process.', async () => {
            const canProceed = await this.plugin.canProceedWithLinkCreation();
            if (canProceed) {
                this.plugin.startLinkCreationProcess();
            }
            this.close();
        });

        // Button to revert all changes made by the plugin.
        createButtonWithDescription('Revert Changes', 'Reverts all changes made by the plugin.', () => {
            new ConfirmationModal(this.app, "Are you sure you want to revert all changes? This action cannot be undone.", () => {
                this.plugin.revertChanges();
                this.close();
            }).open();
        });

        // Button to accept all changes and delete backup files.
        createButtonWithDescription('Accept All Changes', 'Accepts all changes and deletes backup files. This action is irreversible.', () => {
            new ConfirmationModal(this.app, "Are you sure you want to accept all changes and delete all backup files? This action cannot be undone.", () => {
                this.plugin.acceptAllChanges();
                this.close();
            }).open();
        });
    }

    /**
     * Cleans up the modal's content when it's closed to ensure a fresh state on next open.
     */
    onClose() {
        this.contentEl.empty();
    }
}

/**
 * Custom modal for displaying a confirmation dialog with "Confirm" and "Cancel" buttons.
 * Allows executing different actions based on the user's choice.
 */
class ConfirmationModal extends Modal {
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;

    /**
     * Constructs a confirmation modal.
     * 
     * @param {App} app - The main app instance.
     * @param {string} message - The message to display in the modal.
     * @param {() => void} onConfirm - Callback to execute when "Confirm" is clicked.
     * @param {() => void} [onCancel] - Optional callback to execute when "Cancel" is clicked.
     */
    constructor(app: App, message: string, onConfirm: () => void, onCancel?: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
    }

    /**
     * Sets up the modal's content when it's opened.
     */
    onOpen() {
        this.contentEl.createEl('p', { text: this.message });

        // Creating the "Confirm" button with a primary call-to-action style.
        this.contentEl.createEl('button', {
            text: 'Confirm',
            cls: 'mod-cta',
            type: 'button'
        }).addEventListener('click', () => {
            this.onConfirm();
            this.close();
        });

        // Creating the "Cancel" button with a default style.
        this.contentEl.createEl('button', {
            text: 'Cancel',
            type: 'button'
        }).addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel();
            }
            this.close();
        });
    }

    /**
     * Cleans up the modal's content when it's closed to ensure a fresh state on the next open.
     */
    onClose() {
        this.contentEl.empty();
    }
}

/**
 * An extension of the Modal class that provides a confirmation dialog with an additional checkbox option.
 * This modal is designed to confirm an action and optionally include an additional step based on the user's input.
 * It is particularly useful when an action has a primary effect and an optional secondary effect that the user can choose.
 *
 * @extends Modal The base class for modal dialogs in Obsidian.
 */
class ExtendedConfirmationModal extends Modal {
    message: string;
    onConfirm: (alsoDeleteData: boolean) => void;

    /**
     * Constructs an instance of the ExtendedConfirmationModal.
     *
     * @param {App} app The main app instance, passed to the Modal constructor.
     * @param {string} message The message to display in the modal.
     * @param {(alsoDeleteData: boolean) => void} onConfirm A callback function that gets called when the user confirms the action.
     *        The callback receives a boolean indicating whether the user opted to perform the additional action (e.g., deleting data).
     */
    constructor(app: App, message: string, onConfirm: (alsoDeleteData: boolean) => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    /**
     * Sets up the modal's content when it's opened, including the primary message, an optional checkbox for additional action, 
     * and 'Confirm' and 'Cancel' buttons.
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Display the primary message to the user.
        contentEl.createEl('p', { text: this.message });

        // Create a checkbox for the user to select if they also want to perform the additional action (e.g., deleting the _tmldata folder).
        const checkbox = contentEl.createEl('input', { type: 'checkbox' });
        // Description next to the checkbox.
        contentEl.createEl('span', { text: ' Also delete the _tmldata folder and ReviewChanges.md.' });

        // Create a 'Confirm' button that when clicked, executes the onConfirm callback with the checkbox's state.
        contentEl.createEl('button', {
            text: 'Confirm',
            cls: 'mod-cta',
        }).addEventListener('click', () => {
            this.onConfirm(checkbox.checked);
            this.close();
        });

        // Create a 'Cancel' button that closes the modal without executing the onConfirm callback.
        contentEl.createEl('button', {
            text: 'Cancel',
        }).addEventListener('click', () => this.close());
    }
}




/**
 * Settings tab for TitleMatchLinker plugin, allowing users to configure
 * which folders to exclude from the link creation process.
 * Additional settings enable initiating the link creation process,
 * reverting changes, and accepting all changes through the UI.
 */
class SettingTab extends PluginSettingTab {
    plugin: TitleMatchLinker;

    constructor(app: App, plugin: TitleMatchLinker) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Displays the settings for the TitleMatchLinker plugin, providing a UI for user interaction.
     */
    display() {
        const { containerEl } = this;
        containerEl.empty();

        let textareaElement: HTMLTextAreaElement;
        new Setting(containerEl)
            .setName('Excluded Folders')
            .setDesc('Folders to exclude from processing. Enter one folder path per line.')
            .addTextArea(text => {
                textareaElement = text.inputEl;
                text.setValue(this.plugin.settings.excludedFolders.join('\n'));
            });

        // Save button for excluded folders
        new Setting(containerEl)
            .addButton(button => {
                button.setButtonText('Save')
                    .setCta()
                    .onClick(async () => {
                        const folderPaths = textareaElement.value.split('\n').map(line => line.trim()).filter(Boolean);
                        const validatedFolders: string[] = [];
                        const invalidFolders: string[] = [];

                        for (const folderPath of folderPaths) {
                            if (this.plugin.app.vault.getAbstractFileByPath(folderPath) instanceof TFolder) {
                                validatedFolders.push(folderPath);
                            } else {
                                invalidFolders.push(folderPath);
                            }
                        }

                        // Update the textarea to only include validated folder paths
                        textareaElement.value = validatedFolders.join('\n');
                        this.plugin.settings.excludedFolders = validatedFolders;
                        await this.plugin.saveSettings();

                        if (invalidFolders.length > 0) {
                            new Notice(`Invalid folders not saved: ${invalidFolders.join(', ')}`);
                            // Remove invalid folders from the textarea
                            textareaElement.value = validatedFolders.join('\n');
                        } else {
                            new Notice("Settings updated successfully.");
                        }
                    });
            });

        // Function to add action buttons
        const addActionSetting = (
            name: string,
            desc: string,
            buttonText: string,
            action: () => Promise<void> | void
        ): void => {
            new Setting(containerEl)
                .setName(name)
                .setDesc(desc)
                .addButton(button => {
                    button.setButtonText(buttonText).onClick(async () => {
                        try {
                            await action();
                        } catch (error) {
                            console.error(`Error executing action for ${buttonText}:`, error);
                            // Optionally, provide user feedback here
                        }
                    });
                });
        };

        // Add buttons for starting link creation, reverting changes, and accepting all changes
        addActionSetting('Start Link Creation', 'Initiates the link creation process.', 'Start', async () => {
            if (await this.plugin.canProceedWithLinkCreation()) {
                this.plugin.startLinkCreationProcess();
            }
        });

        addActionSetting('Revert Changes', 'Reverts all changes made by the plugin.', 'Revert', () => {
            new ConfirmationModal(this.app, "Are you sure you want to revert all changes? This action cannot be undone.", () => {
                this.plugin.revertChanges();
            }).open();
        });

        addActionSetting('Accept All Changes', 'Accepts all changes and deletes backup files. This action is irreversible.', 'Accept', () => {
            new ConfirmationModal(this.app, "Are you sure you want to accept all changes and delete all backup files? This action cannot be undone.", () => {
                this.plugin.acceptAllChanges();
            }).open();
        });

        
    }
}




               
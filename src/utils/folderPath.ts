/**
 * Utility for parsing and handling OmniFocus folder paths.
 * Supports paths like "01 Projects : Home Renovations" with " : " as delimiter.
 */

/**
 * Parse a folder path string into an array of folder names.
 * @param path Folder path with " : " delimiter (e.g., "01 Projects : Home Renovations")
 * @returns Array of folder names in order from root to deepest
 */
export function parseFolderPath(path: string): string[] {
  if (!path || path.trim() === '') {
    return [];
  }

  // Split by " : " delimiter (with spaces around colon)
  return path.split(' : ').map(segment => segment.trim()).filter(segment => segment !== '');
}

/**
 * Generate AppleScript code that ensures a folder path exists and returns a reference to the deepest folder.
 * Creates any missing folders in the hierarchy.
 *
 * @param path Folder path with " : " delimiter
 * @param varName Variable name to store the final folder reference
 * @returns AppleScript code to find or create the folder path
 */
export function generateFolderPathScript(path: string, varName: string): string {
  const segments = parseFolderPath(path);

  if (segments.length === 0) {
    return `set ${varName} to missing value`;
  }

  if (segments.length === 1) {
    // Single folder - simple case
    const folderName = segments[0].replace(/['"\\]/g, '\\$&');
    return `
      -- Find or create single folder: ${folderName}
      set ${varName} to missing value
      try
        set ${varName} to first flattened folder where name = "${folderName}"
      end try
      if ${varName} is missing value then
        set ${varName} to make new folder with properties {name:"${folderName}"}
      end if`;
  }

  // Multiple segments - walk the path and create as needed
  let script = `
      -- Find or create folder path: ${path}
      set parentFolder to missing value
      set ${varName} to missing value`;

  segments.forEach((segment, index) => {
    const folderName = segment.replace(/['"\\]/g, '\\$&');
    const isFirst = index === 0;
    const isLast = index === segments.length - 1;

    if (isFirst) {
      // First segment - search at root level
      script += `

      -- Level ${index + 1}: "${folderName}"
      set currentFolder to missing value
      try
        set currentFolder to first flattened folder where name = "${folderName}"
      end try
      if currentFolder is missing value then
        set currentFolder to make new folder with properties {name:"${folderName}"}
      end if`;
    } else {
      // Subsequent segments - search within parent
      script += `

      -- Level ${index + 1}: "${folderName}" (inside previous folder)
      set parentFolder to currentFolder
      set currentFolder to missing value
      try
        repeat with aFolder in folders of parentFolder
          if name of aFolder = "${folderName}" then
            set currentFolder to aFolder
            exit repeat
          end if
        end repeat
      end try
      if currentFolder is missing value then
        set currentFolder to make new folder with properties {name:"${folderName}"} at end of folders of parentFolder
      end if`;
    }

    if (isLast) {
      script += `
      set ${varName} to currentFolder`;
    }
  });

  return script;
}

/**
 * Sanitize a folder name for use in AppleScript
 */
export function sanitizeFolderName(name: string): string {
  return name.replace(/['"\\]/g, '\\$&');
}

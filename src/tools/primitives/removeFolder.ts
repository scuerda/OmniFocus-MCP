import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

// Interface for folder removal parameters
export interface RemoveFolderParams {
  id?: string;          // ID of the folder to remove
  name?: string;        // Name of the folder to remove (as fallback if ID not provided)
  removeContents?: boolean; // If true, also remove all projects in the folder (default: false)
}

/**
 * Generate AppleScript for folder removal
 */
function generateAppleScript(params: RemoveFolderParams): string {
  const id = params.id?.replace(/['"\\]/g, '\\$&') || '';
  const name = params.name?.replace(/['"\\]/g, '\\$&') || '';
  const removeContents = params.removeContents === true;

  if (!id && !name) {
    return `return "{\\\"success\\\":false,\\\"error\\\":\\\"Either id or name must be provided\\\"}"`;
  }

  let script = `
try
  tell application "OmniFocus"
    tell front document
      -- Find the folder to remove
      set foundFolder to missing value
`;

  if (id) {
    script += `
      -- Try to find folder by ID
      try
        set foundFolder to first flattened folder where id = "${id}"
      end try
`;
  }

  if (!id && name) {
    script += `
      -- Find folder by name
      try
        set foundFolder to first flattened folder where name = "${name}"
      end try
`;
  } else if (id && name) {
    script += `
      -- If ID search failed, try to find by name as fallback
      if foundFolder is missing value then
        try
          set foundFolder to first flattened folder where name = "${name}"
        end try
      end if
`;
  }

  script += `
      -- If we found the folder, check and remove it
      if foundFolder is not missing value then
        set folderName to name of foundFolder
        set folderId to id of foundFolder as string
        set projectCount to count of projects of foundFolder
        set subfolderCount to count of folders of foundFolder

        -- Check if folder has contents
        if projectCount > 0 or subfolderCount > 0 then
`;

  if (removeContents) {
    script += `
          -- Remove contents first (projects and subfolders)
          repeat with p in projects of foundFolder
            delete p
          end repeat
          repeat with f in folders of foundFolder
            delete f
          end repeat
`;
  } else {
    script += `
          -- Folder has contents and removeContents is false
          return "{\\\"success\\\":false,\\\"error\\\":\\\"Folder contains " & projectCount & " projects and " & subfolderCount & " subfolders. Set removeContents to true to delete anyway.\\\"}"
`;
  }

  script += `
        end if

        -- Delete the folder
        delete foundFolder

        -- Return success
        return "{\\\"success\\\":true,\\\"id\\\":\\"" & folderId & "\\",\\\"name\\\":\\"" & folderName & "\\"}"
      else
        -- Folder not found
        return "{\\\"success\\\":false,\\\"error\\\":\\\"Folder not found\\\"}"
      end if
    end tell
  end tell
on error errorMessage
  return "{\\\"success\\\":false,\\\"error\\\":\\"" & errorMessage & "\\"}"
end try
`;

  return script;
}

/**
 * Remove a folder from OmniFocus
 */
export async function removeFolder(params: RemoveFolderParams): Promise<{
  success: boolean;
  id?: string;
  name?: string;
  error?: string;
}> {
  let tempFile: string | undefined;

  try {
    const script = generateAppleScript(params);

    console.error("Executing AppleScript for folder removal...");
    console.error(`Folder ID: ${params.id || 'not provided'}, Name: ${params.name || 'not provided'}, removeContents: ${params.removeContents || false}`);

    // Write script to temporary file to avoid shell escaping issues
    tempFile = join(tmpdir(), `remove_folder_${Date.now()}.applescript`);
    writeFileSync(tempFile, script);

    // Execute AppleScript from file
    const { stdout, stderr } = await execAsync(`osascript ${tempFile}`);

    // Clean up temp file
    try {
      unlinkSync(tempFile);
    } catch (cleanupError) {
      console.error("Failed to clean up temp file:", cleanupError);
    }

    if (stderr) {
      console.error("AppleScript stderr:", stderr);
    }

    console.error("AppleScript stdout:", stdout);

    // Parse the result
    try {
      const result = JSON.parse(stdout);
      return {
        success: result.success,
        id: result.id,
        name: result.name,
        error: result.error
      };
    } catch (parseError) {
      console.error("Error parsing AppleScript result:", parseError);
      return {
        success: false,
        error: `Failed to parse result: ${stdout}`
      };
    }
  } catch (error: any) {
    // Clean up temp file if it exists
    if (tempFile) {
      try {
        unlinkSync(tempFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

    console.error("Error in removeFolder execution:", error);
    return {
      success: false,
      error: error?.message || "Unknown error in removeFolder"
    };
  }
}

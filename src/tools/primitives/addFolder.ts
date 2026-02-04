import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateFolderPathScript, parseFolderPath, sanitizeFolderName } from '../../utils/folderPath.js';

const execAsync = promisify(exec);

// Interface for folder creation parameters
export interface AddFolderParams {
  name: string;
  parentFolderName?: string;  // Optional parent folder (supports path syntax with " : ")
}

/**
 * Generate AppleScript for folder creation
 */
function generateAppleScript(params: AddFolderParams): string {
  const name = sanitizeFolderName(params.name);
  const parentPath = params.parentFolderName || '';

  let script = `try
  tell application "OmniFocus"
    tell front document`;

  if (parentPath) {
    // Parent folder specified - find or create it, then create the new folder inside
    script += generateFolderPathScript(parentPath, 'parentFolder');

    script += `

      -- Create the new folder inside the parent
      if parentFolder is not missing value then
        set newFolder to make new folder with properties {name:"${name}"} at end of folders of parentFolder
        set folderId to id of newFolder as string
        return "{\\"success\\":true,\\"folderId\\":\\"" & folderId & "\\",\\"name\\":\\"${name}\\",\\"parent\\":\\"${sanitizeFolderName(parentPath)}\\"}"
      else
        return "{\\"success\\":false,\\"error\\":\\"Could not find or create parent folder: ${sanitizeFolderName(parentPath)}\\"}"
      end if`;
  } else {
    // No parent - create at root level
    script += `
      -- Create folder at root level
      set newFolder to make new folder with properties {name:"${name}"}
      set folderId to id of newFolder as string
      return "{\\"success\\":true,\\"folderId\\":\\"" & folderId & "\\",\\"name\\":\\"${name}\\"}"`;
  }

  script += `
    end tell
  end tell
on error errorMessage
  return "{\\"success\\":false,\\"error\\":\\"" & errorMessage & "\\"}"
end try`;

  return script;
}

/**
 * Add a folder to OmniFocus
 */
export async function addFolder(params: AddFolderParams): Promise<{
  success: boolean;
  folderId?: string;
  name?: string;
  parent?: string;
  error?: string;
}> {
  let tempFile: string | undefined;

  try {
    const script = generateAppleScript(params);

    console.error("Executing AppleScript for folder creation...");
    console.error(`Folder name: ${params.name}, Parent: ${params.parentFolderName || 'root'}`);

    // Write script to temporary file to avoid shell escaping issues
    tempFile = join(tmpdir(), `add_folder_${Date.now()}.applescript`);
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
        folderId: result.folderId,
        name: result.name,
        parent: result.parent,
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

    console.error("Error in addFolder execution:", error);
    return {
      success: false,
      error: error?.message || "Unknown error in addFolder"
    };
  }
}

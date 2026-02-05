import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDateOutsideTellBlock } from '../../utils/dateFormatting.js';
import { generateFolderPathScript, sanitizeFolderName } from '../../utils/folderPath.js';
const execAsync = promisify(exec);

// Interface for project creation parameters
export interface AddProjectParams {
  name: string;
  note?: string;
  dueDate?: string; // ISO date string
  deferDate?: string; // ISO date string
  flagged?: boolean;
  estimatedMinutes?: number;
  tags?: string[]; // Tag names
  folderName?: string; // Folder name to add project to
  sequential?: boolean; // Whether tasks should be sequential or parallel
  repetitionRule?: string; // iCalendar RRULE string (e.g., "FREQ=WEEKLY;INTERVAL=1")
  repetitionMethod?: 'fixed' | 'start-after-completion' | 'due-after-completion'; // How next occurrence is calculated
}

/**
 * Generate pure AppleScript for project creation
 */
function generateAppleScript(params: AddProjectParams): string {
  // Sanitize and prepare parameters for AppleScript
  const name = params.name.replace(/['"\\]/g, '\\$&'); // Escape quotes and backslashes
  const note = params.note?.replace(/['"\\]/g, '\\$&') || '';
  const dueDate = params.dueDate || '';
  const deferDate = params.deferDate || '';
  const flagged = params.flagged === true;
  const estimatedMinutes = params.estimatedMinutes?.toString() || '';
  const tags = params.tags || [];
  const folderPath = params.folderName || '';
  const sequential = params.sequential === true;
  const repetitionRule = params.repetitionRule || '';
  const repetitionMethod = params.repetitionMethod || 'fixed';

  // Map repetition method to AppleScript value
  const repetitionMethodMap: Record<string, string> = {
    'fixed': 'fixed repetition',
    'start-after-completion': 'start after completion',
    'due-after-completion': 'due after completion'
  };
  const repetitionMethodValue = repetitionMethodMap[repetitionMethod] || 'fixed repetition';
  
  // Generate date constructions outside tell blocks
  let datePreScript = '';
  let dueDateVar = '';
  let deferDateVar = '';
  
  if (dueDate) {
    dueDateVar = `dueDate${Math.random().toString(36).substr(2, 9)}`;
    datePreScript += createDateOutsideTellBlock(dueDate, dueDateVar) + '\n\n';
  }
  
  if (deferDate) {
    deferDateVar = `deferDate${Math.random().toString(36).substr(2, 9)}`;
    datePreScript += createDateOutsideTellBlock(deferDate, deferDateVar) + '\n\n';
  }
  
  // Construct AppleScript with error handling
  let script = datePreScript + `
  try
    tell application "OmniFocus"
      tell front document`;

  if (folderPath) {
    // Folder path specified - find or create it
    const folderPathScript = generateFolderPathScript(folderPath, 'theFolder');
    script += `
        -- Find or create folder path: ${sanitizeFolderName(folderPath)}
        ${folderPathScript}

        if theFolder is not missing value then
          set newProject to make new project with properties {name:"${name}"} at end of projects of theFolder
        else
          return "{\\\"success\\\":false,\\\"error\\\":\\\"Could not find or create folder: ${sanitizeFolderName(folderPath)}\\\"}"
        end if`;
  } else {
    // No folder - create at root level
    script += `
        -- Create project at the root level
        set newProject to make new project with properties {name:"${name}"}`;
  }

  script += `
        
        -- Set project properties
        ${note ? `set note of newProject to "${note}"` : ''}
        ${dueDate ? `
          -- Set due date
          set due date of newProject to ` + dueDateVar : ''}
        ${deferDate ? `
          -- Set defer date
          set defer date of newProject to ` + deferDateVar : ''}
        ${flagged ? `set flagged of newProject to true` : ''}
        ${estimatedMinutes ? `set estimated minutes of newProject to ${estimatedMinutes}` : ''}
        ${`set sequential of newProject to ${sequential}`}
        ${repetitionRule ? `
        -- Set repetition rule
        set repetition rule of newProject to {recurrence:"${repetitionRule}", repetition method:${repetitionMethodValue}}` : ''}

        -- Get the project ID
        set projectId to id of newProject as string
        
        -- Add tags if provided
        ${tags.length > 0 ? tags.map(tag => {
          const sanitizedTag = tag.replace(/['"\\]/g, '\\$&');
          return `
          try
            set theTag to first flattened tag where name = "${sanitizedTag}"
            add theTag to tags of newProject
          on error
            -- Tag might not exist, try to create it
            try
              set theTag to make new tag with properties {name:"${sanitizedTag}"}
              add theTag to tags of newProject
            on error
              -- Could not create or add tag
            end try
          end try`;
        }).join('\n') : ''}
        
        -- Return success with project ID
        return "{\\\"success\\\":true,\\\"projectId\\\":\\"" & projectId & "\\",\\\"name\\\":\\"${name}\\"}"
      end tell
    end tell
  on error errorMessage
    return "{\\\"success\\\":false,\\\"error\\\":\\"" & errorMessage & "\\"}"
  end try
  `;
  
  return script;
}

/**
 * Add a project to OmniFocus
 */
export async function addProject(params: AddProjectParams): Promise<{success: boolean, projectId?: string, error?: string}> {
  let tempFile: string | undefined;

  try {
    // Generate AppleScript
    const script = generateAppleScript(params);

    console.error("Executing AppleScript for project creation...");
    console.error(`Project name: ${params.name}, Folder: ${params.folderName || 'root'}`);

    // Write script to temporary file to avoid shell escaping issues
    tempFile = join(tmpdir(), `add_project_${Date.now()}.applescript`);
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

      // Return the result
      return {
        success: result.success,
        projectId: result.projectId,
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

    console.error("Error in addProject:", error);
    return {
      success: false,
      error: error?.message || "Unknown error in addProject"
    };
  }
} 
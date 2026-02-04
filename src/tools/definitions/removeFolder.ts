import { z } from 'zod';
import { removeFolder, RemoveFolderParams } from '../primitives/removeFolder.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

export const schema = z.object({
  id: z.string().optional().describe("The ID of the folder to remove"),
  name: z.string().optional().describe("The name of the folder to remove (as fallback if ID not provided)"),
  removeContents: z.boolean().optional().describe("If true, also remove all projects and subfolders in the folder. Default: false (will fail if folder has contents)")
});

export async function handler(args: z.infer<typeof schema>, extra: RequestHandlerExtra) {
  try {
    // Validate that either id or name is provided
    if (!args.id && !args.name) {
      return {
        content: [{
          type: "text" as const,
          text: "Either id or name must be provided to remove a folder."
        }],
        isError: true
      };
    }

    console.error(`Removing folder with ID: ${args.id || 'not provided'}, Name: ${args.name || 'not provided'}`);

    const result = await removeFolder(args as RemoveFolderParams);

    if (result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `Folder "${result.name}" removed successfully.`
        }]
      };
    } else {
      let errorMsg = "Failed to remove folder";

      if (result.error) {
        if (result.error.includes("Folder not found")) {
          errorMsg = "Folder not found";
          if (args.id) errorMsg += ` with ID "${args.id}"`;
          if (args.name) errorMsg += `${args.id ? ' or' : ' with'} name "${args.name}"`;
          errorMsg += '.';
        } else if (result.error.includes("contains")) {
          // Folder has contents
          errorMsg = result.error;
        } else {
          errorMsg += `: ${result.error}`;
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: errorMsg
        }],
        isError: true
      };
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Tool execution error: ${error.message}`);

    return {
      content: [{
        type: "text" as const,
        text: `Error removing folder: ${error.message}`
      }],
      isError: true
    };
  }
}

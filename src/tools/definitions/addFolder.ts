import { z } from 'zod';
import { addFolder, AddFolderParams } from '../primitives/addFolder.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

export const schema = z.object({
  name: z.string().describe("The name of the folder to create"),
  parentFolderName: z.string().optional().describe("The parent folder name or path (e.g., '01 Projects' or '01 Projects : Home Renovations'). Uses ' : ' as path delimiter. Missing folders in the path will be auto-created. Omit to create at root level.")
});

export async function handler(args: z.infer<typeof schema>, extra: RequestHandlerExtra) {
  try {
    const result = await addFolder(args as AddFolderParams);

    if (result.success) {
      const locationText = result.parent
        ? `inside "${result.parent}"`
        : "at the root level";

      return {
        content: [{
          type: "text" as const,
          text: `Folder "${result.name}" created successfully ${locationText}.`
        }]
      };
    } else {
      return {
        content: [{
          type: "text" as const,
          text: `Failed to create folder: ${result.error}`
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
        text: `Error creating folder: ${error.message}`
      }],
      isError: true
    };
  }
}

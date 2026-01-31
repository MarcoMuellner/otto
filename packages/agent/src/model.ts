import {ChatOpenAI} from "@langchain/openai";
import {z} from "zod";

export const ModelConfigSchema = z.object({
    provider: z.enum(["openai"]),
    openai: z.object({
        apiKey: z.string().min(1),
        model: z.string().min(1),
    }),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** Creates a chat model instance from validated configuration. */
export function createModel(config: ModelConfig): ChatOpenAI {
    const parsed = ModelConfigSchema.parse(config);

    if (parsed.provider === "openai") {
        return new ChatOpenAI({
            apiKey: parsed.openai.apiKey,
            model: parsed.openai.model,
            temperature: parsed.temperature,
            maxTokens: parsed.maxTokens,
        });
    }

    throw new Error(`Unsupported provider: ${parsed.provider}`);
}

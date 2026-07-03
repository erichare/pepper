/**
 * POST /api/reply — stream a newppinpoint reply for a live r/Chipotle post.
 *
 * Plain-text streaming response. Non-regenerate requests are served from the
 * KV cache when possible; fresh generations are rate limited per IP and
 * capped by a global daily budget. Completed replies are cached for 7 days
 * (regenerate overwrites: last write wins).
 */

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { z } from "zod";
import { kv } from "@/lib/kv";
import { buildSystemPrompt, buildUserMessage } from "@/lib/persona/prompt";
import { checkDailyBudget, checkReplyLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

const CACHE_TTL_SECONDS = 7 * 24 * 3600;
const DEFAULT_MODEL = "claude-sonnet-5";

const replyRequestSchema = z.object({
  postId: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-z0-9_]+$/i),
  title: z.string().transform((s) => s.slice(0, 300)),
  selftext: z
    .string()
    .max(8000)
    .transform((s) => s.slice(0, 2000))
    .default(""),
  flair: z.string().max(64).nullable().optional(),
  mode: z.enum(["default", "zinger", "rant"]).default("default"),
  regenerate: z.boolean().default(false),
  previousReply: z.string().max(2000).nullable().optional(),
});

type ReplyRequestBody = z.infer<typeof replyRequestSchema>;

async function parseBody(request: Request): Promise<ReplyRequestBody | null> {
  try {
    const raw: unknown = await request.json();
    const result = replyRequestSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "local";
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (!body) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const cacheKey = `reply:v1:${body.postId}:${body.mode}`;

  if (!body.regenerate) {
    try {
      const cached = await kv.get<string>(cacheKey);
      if (cached) {
        return new Response(cached, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "x-reply-cache": "hit",
          },
        });
      }
    } catch {
      // Cache read failure is non-fatal — fall through to generation.
    }
  }

  const limit = await checkReplyLimit(clientIp(request), body.regenerate ? 2 : 1);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: limit.retryAfterSeconds ?? 60 },
      { status: 429 },
    );
  }

  const withinBudget = await checkDailyBudget();
  if (!withinBudget) {
    return Response.json({ error: "daily_budget_exhausted" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "not_configured" }, { status: 500 });
  }

  try {
    const result = streamText({
      model: anthropic(process.env.PERSONA_MODEL ?? DEFAULT_MODEL),
      instructions: {
        role: "system",
        content: buildSystemPrompt(body.mode),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      prompt: buildUserMessage({
        title: body.title,
        selftext: body.selftext,
        flair: body.flair ?? null,
        postId: body.postId,
        mode: body.mode,
        regenerate: body.regenerate,
        previousReply: body.previousReply ?? null,
        attempt: body.regenerate ? 1 : 0,
      }),
      maxOutputTokens: 400,
      temperature: body.regenerate ? 1.0 : 0.9,
      onFinish: async ({ text }) => {
        if (!text) return;
        try {
          // Always overwrite: regenerate is last-write-wins.
          await kv.set(cacheKey, text, CACHE_TTL_SECONDS);
        } catch {
          // Cache write failure is non-fatal — the reply already streamed.
        }
      },
    });

    return result.toTextStreamResponse({ headers: { "x-reply-cache": "miss" } });
  } catch {
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }
}

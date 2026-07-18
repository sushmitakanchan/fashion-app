# Ubiquitous language

## AI provider selection

The server-side configuration that selects the AI provider for an AI request. It is configurable in every environment; when omitted, it defaults to OpenAI. Production does not override an explicit selection.

Selection uses Vercel AI SDK with direct OpenAI and Anthropic provider packages. It does not use Vercel AI Gateway; each provider uses its own credentials and billing relationship.

## Text generation

The current provider-neutral AI capability: a non-streaming server-side exchange of a system prompt and a user prompt for reply text. Streaming, tool calls, images, and provider-specific request options are not part of this capability yet.

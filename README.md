# humanllm
OpenAI API-compatible LLM powered by YOU

# Requirements

- Node.js

# Usage

1.  Register OpenAI API compatible endpoint `http://localhost:3000/v1` to your chat app or agent

2. Run UI and API server

```bash
# UI: http://localhost:5173/
# API Server: http://localhost:3000/
$ npm run dev
```

3. Open UI http://localhost:5173/

4. Open the app or the agent and send a request

5. Read the request on the UI and respond to it!

## Example: Call from Codex

```toml
# ~/.codex/humanllm.config.toml
model = "human"
model_provider = "humanllm"

[model_providers.humanllm]
name = "Human LLM"
base_url = "http://localhost:3000/v1"
bearer_token_env_var = "HUMANLLM_API_KEY"

[projects."/home/syuparn/tmp/hoge"]
trust_level = "trusted"

[tui.model_availability_nux]
"gpt-5.5" = 4
```

```bash
$ codex --profile humanllm
```

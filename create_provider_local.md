# Add "Local" API Type to Custom Providers (Generic Routing)

The goal of this task is to introduce a new "Local" API Type option in the custom provider configuration modal. This provider will behave as a generic local provider (`local:${uuid}`), allowing the integration of multiple custom local backends (such as ComfyUI, OmniVoice, Ollama, etc.) under the same provider type.

Requests will be routed dynamically:
1. **LLM models**: Routed via the standard OpenAI compatibility layer.
2. **Image/Video models**:
   - If the model ID starts with `comfyui` (e.g., `comfyui_image`), route to `ComfyUIImageGenerator` / `ComfyUIVideoGenerator`.
   - Otherwise, route to `OpenAICompatibleImageGenerator` / `OpenAICompatibleVideoGenerator` (which uses custom media templates).
3. **Audio models**:
   - If the model ID starts with `omnivoice` (or `omni_voice`), route to `OmniVoiceTTSGenerator`.
   - Otherwise, route to generic custom templates or throw.

This design keeps the provider key generic (`local`) while allowing the integration of any custom local providers in the future.

---

## User Review Required

> [!IMPORTANT]
> - The new provider type will have `apiType: 'local'` and `providerId` as `local:${uuid}`.
> - The provider key `local`, as well as `comfyui` and `omnivoice`, will all be classified as optional pricing providers (priced at 0, bypassing pricing checks).
> - Specific local generator routing will inspect the model ID (e.g. starting with `comfyui` or `omnivoice`) to instantiate dedicated local handlers, allowing multiple local technologies to be configured under a single local provider.

---

## Proposed Changes

### 1. Translations

#### [MODIFY] [en/apiConfig.json](file:///run/media/thqui/_data/waoowaoo/messages/en/apiConfig.json)
- Add `"apiTypeLocal": "Local"`
- Add `"compatibilityLayerLocal": "Local Layer"`
- Add `"tutorial.steps.local_step1": "Enter the Base URL and API Key for your local service (e.g., http://localhost:11434, http://127.0.0.1:8188 or http://localhost:8000)"`

#### [MODIFY] [zh/apiConfig.json](file:///run/media/thqui/_data/waoowaoo/messages/zh/apiConfig.json)
- Add `"apiTypeLocal": "本地"`
- Add `"compatibilityLayerLocal": "本地层"`
- Add `"tutorial.steps.local_step1": "输入本地服务的 Base URL 与 API Key（例如 http://localhost:11434, http://127.0.0.1:8188 或 http://localhost:8000）"`

---

### 2. Frontend Components

#### [MODIFY] [ApiConfigTabContainer.tsx](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config-tab/ApiConfigTabContainer.tsx)
- Expand `CustomProviderType` type union:
  ```typescript
  type CustomProviderType = 'gemini-compatible' | 'openai-compatible' | 'local'
  ```
- Render `<option value="local">{t('apiTypeLocal')}</option>` inside the API Type select dropdown.
- In `doAddProvider`, set `apiMode` to `'openai-official'` if `newGeminiProvider.apiType` is `'openai-compatible'` or `'local'`.

#### [MODIFY] [useApiConfigFilters.ts](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters.ts)
- Add `'local'` to `DYNAMIC_PROVIDER_PREFIXES`.
- Add `'local'` to `MODEL_PROVIDER_KEYS`.

#### [MODIFY] [types.ts (frontend api-config)](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config/types.ts)
- Add `"local"` to the `PROVIDER_TUTORIALS` config array:
  ```json
  {
      "providerId": "local",
      "steps": [{ "text": "local_step1" }]
  }
  ```

#### [MODIFY] [ProviderCardShell.tsx](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config/provider-card/ProviderCardShell.tsx)
- Update `getCompatibilityLayerBadgeLabel` to return `t('compatibilityLayerLocal')` if the `providerKey` is `'local'`.

#### [MODIFY] [types.ts (provider-card)](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config/provider-card/types.ts)
- Add `'local'` to `VERIFIABLE_PROVIDER_KEYS`.

#### [MODIFY] [ProviderBaseFields.tsx](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config/provider-card/ProviderBaseFields.tsx)
- Map `baseUrlPlaceholder` for `'local'` to `'http://localhost:8000'`.

#### [MODIFY] [ProviderAdvancedFields.tsx](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields.tsx)
- In `shouldShowOpenAICompatVideoHint`, match `'local'` as well.
- In `shouldShowDefaultTabs`, add `'local'` to the list of provider keys that display all tabs.

#### [MODIFY] [useProviderCardState.ts](file:///run/media/thqui/_data/waoowaoo/src/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState.ts)
- In `shouldProbeModelLlmProtocol` and `shouldReprobeModelLlmProtocol`, check for both `'openai-compatible'` and `'local'`.
- In `buildProviderConnectionPayload`, set `isCompatibleProvider` to true if `providerKey` is `'local'`.
- Add `'local'` to `showBaseUrlEdit` check.

---

### 3. Backend Routing & Validations

#### [MODIFY] [router.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/model-gateway/router.ts)
- Add `'local'` to `COMPATIBLE_PROVIDER_KEYS` to resolve its default route as `'openai-compat'`.

#### [MODIFY] [provider-test.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/user-api/provider-test.ts)
- Update `CompatibleProviderType` union to include `'local'`.
- Update `testProviderConnection` validation check to include `'local'`.
- Map `'local'` case to `testCompatibleProvider(baseUrl!, apiKey, llmModel)`.

#### [MODIFY] [route.ts (api-config)](file:///run/media/thqui/_data/waoowaoo/src/app/api/user/api-config/route.ts)
- Add `'local'` to `OPTIONAL_PRICING_PROVIDER_KEYS`.
- In `resolveProviderGatewayRoute`, allow `'local'` to route via `'openai-compat'`.
- In `normalizeStoredModel`, treat `'local'` provider image/video models as target models for media template validation (`isTargetModel`).
- In `isOpenAICompatibleLlmModel` and `isOpenAICompatibleMediaTemplateModel`, check for `'local'` as well.

#### [MODIFY] [api-config.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/api-config.ts)
- In `parseCustomProviders`, allow `gatewayRoute === 'openai-compat'` when `providerKey === 'local'`.
- In `resolveModelSelection` and `resolveSingleModelSelection`, allow `'local'` to resolve `llmProtocol` and `compatMediaTemplate`.

#### [MODIFY] [probe-model-llm-protocol/route.ts](file:///run/media/thqui/_data/waoowaoo/src/app/api/user/api-config/probe-model-llm-protocol/route.ts)
- Allow `'local'` provider key when validating requests.

#### [MODIFY] [validate-media-template/route.ts](file:///run/media/thqui/_data/waoowaoo/src/app/api/user/api-config/assistant/validate-media-template/route.ts)
- Allow `'local'` provider key when validating requests.

#### [MODIFY] [probe-media-template/route.ts](file:///run/media/thqui/_data/waoowaoo/src/app/api/user/api-config/assistant/probe-media-template/route.ts)
- Allow `'local'` provider key when validating requests.

---

### 4. Dynamic Generator Routing (Generators Factory)

#### [MODIFY] [factory.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/generators/factory.ts)
- In `createImageGenerator`, add `local` case checking for `comfyui` prefix in model ID:
  ```typescript
  case 'comfyui':
  case 'local':
      if (actualModelId?.startsWith('comfyui')) {
          return new ComfyUIImageGenerator(provider)
      }
      return new OpenAICompatibleImageGenerator(actualModelId, provider)
  ```
- In `createVideoGenerator`, add `local` case checking for `comfyui` prefix in model ID:
  ```typescript
  case 'comfyui':
  case 'local':
      if (provider.startsWith('comfyui') || actualModelId?.startsWith('comfyui')) {
          return new ComfyUIVideoGenerator(provider)
      }
      return new OpenAICompatibleVideoGenerator(provider)
  ```
- In `createAudioGenerator`, add `local` case checking for `omnivoice` prefix in model ID:
  ```typescript
  case 'omnivoice':
  case 'local':
      if (provider.startsWith('omnivoice') || actualModelId?.startsWith('omnivoice') || actualModelId?.startsWith('omni_voice')) {
          return new OmniVoiceTTSGenerator(provider)
      }
      throw new Error(`Unknown audio generator provider/model: ${provider}/${actualModelId}`)
  ```

#### [MODIFY] [generate-voice-line.ts](file:///run/media/thqui/_data/waoowaoo/src/lib/voice/generate-voice-line.ts)
- Support `'local'` in checking voice generation provider:
  ```typescript
  } else if (providerKey === 'omnivoice' || providerKey === 'openai-compatible' || providerKey === 'local') {
  ```

---

## Verification Plan

### Automated Tests
- We will add new integration tests inside [user-api-config-put.test.ts](file:///run/media/thqui/_data/waoowaoo/tests/integration/api/specific/user-api-config-put.test.ts):
  - Verify that a `local:uuid` provider can be added and saved successfully.
  - Verify that models added under `local:uuid` skip pricing validation.
- We will add unit tests in [factory.test.ts](file:///run/media/thqui/_data/waoowaoo/tests/unit/generators/factory.test.ts) (or write one) to test the local routing logic for ComfyUI vs OpenAICompatible generators using the model ID prefix.
- Run tests:
  `npx vitest run tests/integration/api/specific/user-api-config-put.test.ts`
  `npx vitest run tests/unit/model-gateway/router.test.ts`

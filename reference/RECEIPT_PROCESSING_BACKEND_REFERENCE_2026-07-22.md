# Receipt Processing Backend Reference Bundle

> Export date: 2026-07-22  
> Source revision: `995ed05dee56418fd188a93c7c846d18a7b39f23` (`origin/master`)

## Purpose

This bundle is a **source-reference package** for a similar project that needs
receipt image/PDF parsing, manual crop, automatic crop re-run, and safe preview
delivery. It is intentionally not a drop-in service: the copied modules retain
their original project imports and data-access contracts.

## Bundle contents

| Path | Why it is included |
|---|---|
| `server/services/receipt_parser.py` | Image preparation, image/PDF parsing, fenced-JSON handling, and parser prompt/response normalization. |
| `server/services/receipt_crop.py` | Manual crop validation, quarter/fine rotation handling, Pillow crop generation, and auto-crop corner-detection wrapper. |
| `server/routers/receipts.py` | Permission-checked original/preview/manual-crop/reset/auto-crop API patterns and no-store file-response headers. |
| `server/config.py` | Non-secret configuration shape, including model-routing environment variable names. |
| `server/requirements.txt` | Python runtime dependencies for the reference modules. |
| `tests/test_receipt_manual_crop_api.py` | Synthetic regression coverage for crop API behavior. |
| `tests/test_anthropic_model_config.py` | Mocked configuration/model-routing coverage. |
| `tests/test_bot_vision_parser.py` | Synthetic image preparation and mocked parser robustness patterns. |

## Explicit exclusions

The export deliberately excludes:

- `.env` files, API keys, tokens, credentials, private keys, and live runtime
  configuration;
- real receipts, OCR output, filenames, source mappings, database files,
  backups, server logs, and deployment scripts;
- application-specific database, user, audit, and frontend modules beyond the
  narrow crop-router reference.

## Adaptation checklist

1. Replace `server.config`, `db`, `audit`, and auth imports with the target
   project's equivalents.
2. Keep the original evidence file immutable; store crop derivatives separately.
3. Preserve finite/bounded rotation and crop-rectangle validation.
4. Preserve permission checks for original, preview, reset, and crop actions.
5. Keep `Cache-Control: no-store` behavior for authenticated evidence previews.
6. Move model names and API configuration to environment/config variables; do
   not hard-code credentials.
7. Use synthetic fixtures and mocked model clients before any real-document UAT.
8. Review the parser prompt, date/currency/category rules, storage lifecycle,
   and retention policy for the new jurisdiction and business process.

## Integrity

The adjacent ZIP is generated from the exact `origin/master` revision stated
above. It is a code-only archive; no runtime data or secrets are included.

SHA-256:

```text
4E6CDA3ABB0D97C969DE531297208BB94A4D8EC413B86A33C1336145D4087F68
```

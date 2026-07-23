const fs = require("fs");

const OCR_PROMPT = `이 이미지는 영수증입니다. 이미지에 실제로 보이는 글자만 읽고 추측하거나 예시 값을 만들지 마세요.
가맹점명과 최종 결제 합계가 명확하지 않으면 해당 값을 null로 두세요. 금액은 공급가액이 아니라 결제/승인 합계를 선택하세요.
다음 JSON 객체 하나만 답하세요(마크다운·설명 금지):
{"merchant":"영수증에 표시된 가맹점명 또는 null","amount":"최종 결제금액 숫자 또는 null","currency":"KRW|USD|JPY","paidAt":"ISO8601(+09:00, 결제/승인 일시. 예매성 결제도 승인일) 또는 null","serviceDate":"YYYY-MM-DD(탑승/투숙 등 실제 이용일, 없으면 null)","vat":"부가세 숫자 또는 null","invoiceNo":"문서번호 또는 null","approvalNo":"승인번호 또는 null","cardLast4":"카드 끝 4자리 또는 null","items":[{"name":"품목","amount":"숫자"}],"confidence":"0~1"}`;

function failure(code, status, message, extra = {}) {
  return { ok: false, error: { code, status, message, ...extra } };
}

function numberValue(value) {
  if (typeof value === "string") value = value.replace(/,/g, "").trim();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOcr(raw) {
  if (!raw || typeof raw !== "object") return null;
  const merchant = typeof raw.merchant === "string" ? raw.merchant.trim() : "";
  const amount = numberValue(raw.amount);
  const currency = String(raw.currency || "KRW").trim().toUpperCase();
  if (!merchant || amount == null || amount <= 0 || !["KRW", "USD", "JPY"].includes(currency)) return null;

  const confidence = numberValue(raw.confidence);
  const vat = raw.vat == null ? null : numberValue(raw.vat);
  const items = Array.isArray(raw.items)
    ? raw.items
      .map((item) => ({
        name: typeof item?.name === "string" ? item.name.trim() : "",
        amount: numberValue(item?.amount),
      }))
      .filter((item) => item.name && item.amount != null)
    : [];

  return {
    merchant,
    amount,
    currency,
    paidAt: raw.paidAt || null,
    serviceDate: raw.serviceDate || null,
    vat,
    invoiceNo: raw.invoiceNo || null,
    approvalNo: raw.approvalNo || null,
    cardLast4: raw.cardLast4 ? String(raw.cardLast4).replace(/\D/g, "").slice(-4) || null : null,
    items,
    confidence: confidence == null ? 0.5 : Math.max(0, Math.min(1, confidence)),
  };
}

function jsonFromModel(content) {
  if (typeof content !== "string") return null;
  const matched = content.match(/\{[\s\S]*\}/);
  if (!matched) return null;
  try {
    return JSON.parse(matched[0]);
  } catch (error) {
    return null;
  }
}

async function recognizeReceipt(filePath, mimetype, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  const key = env.LETSUR_API_KEY;

  if (!key) {
    return failure("OCR_NOT_CONFIGURED", 503, "실제 영수증 인식 서버의 API 키가 설정되지 않았습니다.");
  }
  if (typeof fetchImpl !== "function") {
    return failure("OCR_RUNTIME_UNAVAILABLE", 503, "현재 서버에서 실제 영수증 인식을 실행할 수 없습니다.");
  }
  if (!String(mimetype || "").startsWith("image/")) {
    return failure("OCR_UNSUPPORTED_MEDIA", 415, "현재 실제 OCR은 JPG·PNG 등 이미지 영수증만 지원합니다.");
  }

  let timer;
  try {
    const b64 = fs.readFileSync(filePath).toString("base64");
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), Number(env.OCR_TIMEOUT_MS) || 30000);
    const response = await fetchImpl(`${env.LETSUR_BASE_URL || "https://gw.letsur.ai"}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OCR_MODEL || "gpt-4o",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimetype};base64,${b64}` } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      return failure("OCR_PROVIDER_ERROR", 502, "영수증 인식 서버가 요청을 처리하지 못했습니다.", { providerStatus: response.status });
    }
    const data = await response.json();
    const raw = jsonFromModel(data.choices?.[0]?.message?.content || "");
    const ocr = normalizeOcr(raw);
    if (!ocr) {
      return failure("OCR_INVALID_RESULT", 502, "가맹점 또는 금액을 신뢰할 수 있게 인식하지 못했습니다.");
    }
    return { ok: true, ocr };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return failure("OCR_TIMEOUT", 504, "영수증 인식 시간이 초과되었습니다. 다시 시도해 주세요.");
    }
    return failure("OCR_PROVIDER_ERROR", 502, "영수증 인식 중 오류가 발생했습니다.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { recognizeReceipt, normalizeOcr, jsonFromModel };

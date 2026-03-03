"""
サービスマニュアル PDF 抽出アプリ
- PDFをアップロードすると規定トルク・標準サイズ・部品交換時期を自動抽出
- Claude AI を使用して自然言語でPDFを解析
"""

import os
import json
import tempfile
from flask import Flask, request, jsonify, render_template
import anthropic
import pdfplumber

app = Flask(__name__)

# アップロード可能なファイルサイズ上限 (50MB)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

# Anthropic クライアント初期化
client = anthropic.Anthropic()

# ----------------------
# PDF テキスト抽出
# ----------------------

def extract_text_from_pdf(pdf_path: str) -> str:
    """PDFからテキストを抽出する"""
    all_text = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text:
                all_text.append(f"=== ページ {page_num} ===\n{text}")
    return "\n\n".join(all_text)


# ----------------------
# Claude AI による抽出
# ----------------------

EXTRACTION_PROMPT = """
あなたは機械・設備のサービスマニュアルを解析する専門家です。
以下のPDFテキストから、次の3つのカテゴリの情報を抽出してください。

【抽出対象】
1. 規定トルク (締め付けトルク)
2. 標準サイズ・スペック (タイヤサイズ、チェーンサイズ、バッテリー規格など)
3. 消耗品の交換時期 (走行距離・年数・メーカー指定の交換サイクル)

【出力形式】
必ず以下のJSON形式のみで出力してください。説明文は不要です。

{
  "vehicle_info": {
    "make": "メーカー名",
    "model": "車種・型式",
    "year": "年式"
  },
  "torque_specs": [
    {
      "location": "箇所・部位",
      "part_name": "部品名",
      "torque_nm": "トルク値 (Nm)",
      "torque_kgm": "トルク値 (kgf・m) ※あれば",
      "notes": "備考"
    }
  ],
  "standard_sizes": [
    {
      "category": "カテゴリ (タイヤ/チェーン/バッテリー等)",
      "item": "品目名",
      "specification": "規格・サイズ",
      "notes": "備考"
    }
  ],
  "replacement_intervals": [
    {
      "category": "カテゴリ (エンジン/ブレーキ/駆動系等)",
      "item": "部品・消耗品名",
      "distance_km": "交換距離 (km) ※数値のみ。不明な場合はnull",
      "interval_months": "交換サイクル (月数) ※数値のみ。不明な場合はnull",
      "condition": "状態による交換条件",
      "notes": "備考"
    }
  ]
}

情報が見つからないカテゴリは空の配列 [] のままにしてください。
確認できない値は null としてください。

【PDFテキスト】
"""


def extract_with_claude(pdf_text: str) -> dict:
    """Claude AI を使用してPDFテキストから整備情報を抽出する"""
    # テキストが長すぎる場合は先頭部分を使用 (トークン上限対策)
    max_chars = 80000
    if len(pdf_text) > max_chars:
        pdf_text = pdf_text[:max_chars] + "\n\n[テキストが長いため省略されました]"

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT + pdf_text,
            }
        ],
    )

    response_text = message.content[0].text.strip()

    # JSON部分だけを抽出（マークダウンのコードブロックがある場合に対応）
    if "```json" in response_text:
        start = response_text.index("```json") + 7
        end = response_text.rindex("```")
        response_text = response_text[start:end].strip()
    elif "```" in response_text:
        start = response_text.index("```") + 3
        end = response_text.rindex("```")
        response_text = response_text[start:end].strip()

    return json.loads(response_text)


# ----------------------
# Flask ルート
# ----------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_pdf():
    """PDFをアップロードして整備情報を抽出するAPIエンドポイント"""
    if "pdf" not in request.files:
        return jsonify({"error": "PDFファイルが見つかりません"}), 400

    pdf_file = request.files["pdf"]
    if pdf_file.filename == "":
        return jsonify({"error": "ファイルが選択されていません"}), 400

    if not pdf_file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "PDFファイルのみアップロード可能です"}), 400

    # 一時ファイルに保存して処理
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
        pdf_path = tmp_file.name
        pdf_file.save(pdf_path)

    try:
        # Step 1: PDFからテキスト抽出
        pdf_text = extract_text_from_pdf(pdf_path)
        if not pdf_text.strip():
            return jsonify({"error": "PDFからテキストを読み取れませんでした。スキャン画像のPDFには対応していません。"}), 400

        # Step 2: Claude AI で情報抽出
        result = extract_with_claude(pdf_text)

        # 元のファイル名を追加
        result["source_filename"] = pdf_file.filename

        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify({"error": "AIの応答を解析できませんでした。もう一度お試しください。"}), 500
    except anthropic.APIError as e:
        return jsonify({"error": f"AI APIエラー: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"処理中にエラーが発生しました: {str(e)}"}), 500
    finally:
        # 一時ファイルを削除
        if os.path.exists(pdf_path):
            os.unlink(pdf_path)


if __name__ == "__main__":
    print("=== サービスマニュアル 抽出アプリ ===")
    print("ブラウザで http://localhost:5000 を開いてください")
    app.run(debug=True, host="0.0.0.0", port=5000)

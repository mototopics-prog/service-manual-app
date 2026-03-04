"""
バイク整備早見表アプリ
- メーカー→排気量→車種の順に選択して整備情報を表示
- JSONファイルで車種データを管理（後から追加容易）
"""

import json
import os
import re
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "bikes.json")


def load_bikes():
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_bikes(bikes):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(bikes, f, ensure_ascii=False, indent=2)


@app.route("/")
def index():
    bikes = load_bikes()
    makers = sorted(set(b["maker"] for b in bikes))
    return render_template("index.html", makers=makers)


@app.route("/api/bikes")
def api_bikes():
    return jsonify(load_bikes())


@app.route("/models/<maker>")
def models(maker):
    bikes = load_bikes()
    maker_bikes = [b for b in bikes if b["maker"] == maker]
    displacements = sorted(set(b["displacement"] for b in maker_bikes))
    return render_template("models.html", maker=maker, bikes=maker_bikes, displacements=displacements)


@app.route("/spec/<bike_id>")
def spec(bike_id):
    bikes = load_bikes()
    bike = next((b for b in bikes if b["id"] == bike_id), None)
    if not bike:
        return "車種が見つかりません", 404
    return render_template("spec.html", bike=bike)


# ---- 管理ページ ----

@app.route("/admin")
def admin():
    bikes = load_bikes()
    return render_template("admin.html", bikes=bikes)


@app.route("/admin/save", methods=["POST"])
def admin_save():
    data = request.get_json()
    if not data:
        return jsonify({"error": "データが不正です"}), 400

    bike_id = data.get("id", "").strip()
    if not bike_id:
        return jsonify({"error": "IDが生成できませんでした"}), 400

    bikes = load_bikes()
    if any(b["id"] == bike_id for b in bikes):
        return jsonify({"error": f"ID「{bike_id}」は既に登録済みです。年式または車種名を確認してください。"}), 409

    bikes.append(data)
    save_bikes(bikes)
    return jsonify({"success": True, "id": bike_id})


if __name__ == "__main__":
    print("=== バイク整備早見表アプリ ===")
    print("ブラウザで http://localhost:5000 を開いてください")
    print("同一 Wi-Fi 内からは http://<このPCのIP>:5000 でアクセス可能")
    app.run(debug=True, host="0.0.0.0", port=5000)
